// Background service worker with Gemini AI detection
// Uses Google's Gemini API to analyze images for AI generation

console.log('AI Detector: Background service worker loaded (Gemini-powered)');

// Proxy URL — set this to your Vercel deployment URL
const PROXY_URL = 'https://cyphr-eta.vercel.app/api/gemini';
// Using the stable v1beta API with latest model
const GEMINI_MODEL = 'gemini-2.5-flash'; // Latest stable production model

// TODO: Replace with your AIOrNot API key from https://www.aiornot.com/
const AIORNOT_API_KEY = 'YOUR_AIORNOT_API_KEY_HERE';
// AIOrNot is used as a second opinion when Gemini is uncertain (40-60% confidence)

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeImage') {
    analyzeImageURL(request.imageUrl)
      .then(analysis => sendResponse({ success: true, analysis }))
      .catch(error => {
        console.error('Analysis error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === 'analyzeUploadedImage') {
    // Directly analyze uploaded image using smart fallback system
    (async () => {
      try {
        // Call Gemini first
        const geminiResult = await analyzeWithGemini(request.imageData);
        const geminiAnalysis = parseGeminiResponse(geminiResult);

        // Check if uncertain (40-60%)
        const confidence = geminiAnalysis.confidence;
        const isUncertain = confidence >= 0.4 && confidence <= 0.6;

        if (isUncertain) {
          console.log(`Upload: Gemini uncertain (${Math.round(confidence * 100)}%), calling AIOrNot...`);

          try {
            const aiOrNotResult = await analyzeWithAIOrNot(request.imageData);
            const aiOrNotAnalysis = parseAIOrNotResponse(aiOrNotResult);

            sendResponse({
              success: true,
              analysis: {
                ...combineAnalyses(geminiAnalysis, aiOrNotAnalysis),
                gemini: geminiAnalysis,
                aiOrNot: aiOrNotAnalysis,
                dualVerification: true
              }
            });
          } catch (aiOrNotError) {
            console.error('AIOrNot failed for upload:', aiOrNotError);
            sendResponse({
              success: true,
              analysis: {
                ...geminiAnalysis,
                gemini: geminiAnalysis,
                aiOrNot: null,
                dualVerification: false
              }
            });
          }
        } else {
          console.log(`Upload: Gemini confident (${Math.round(confidence * 100)}%), single verification`);
          sendResponse({
            success: true,
            analysis: {
              ...geminiAnalysis,
              gemini: geminiAnalysis,
              aiOrNot: null,
              dualVerification: false
            }
          });
        }
      } catch (error) {
        console.error('Upload analysis error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (request.action === 'openLearnMore') {
    chrome.tabs.create({ url: 'https://getcyphr.com' });
  }
});

// Main analysis function using Gemini (with AIOrNot fallback)
async function analyzeImageURL(imageUrl) {
  console.log('Analyzing image with Gemini:', imageUrl);

  try {
    // Convert image URL to base64 (required by both APIs)
    const imageData = await fetchImageAsBase64(imageUrl);

    // Call Gemini API for analysis
    const geminiResult = await analyzeWithGemini(imageData);

    // Parse Gemini's response into our format
    const geminiAnalysis = parseGeminiResponse(geminiResult);

    // Check if Gemini is uncertain (40-60% confidence)
    const confidence = geminiAnalysis.confidence;
    const isUncertain = confidence >= 0.4 && confidence <= 0.6;

    if (isUncertain) {
      console.log(`Gemini uncertain (${Math.round(confidence * 100)}%), calling AIOrNot for second opinion...`);

      try {
        // Get second opinion from AIOrNot
        const aiOrNotResult = await analyzeWithAIOrNot(imageData);
        const aiOrNotAnalysis = parseAIOrNotResponse(aiOrNotResult);

        // Return combined results
        return {
          ...combineAnalyses(geminiAnalysis, aiOrNotAnalysis),
          gemini: geminiAnalysis,
          aiOrNot: aiOrNotAnalysis,
          dualVerification: true,
          timestamp: Date.now()
        };
      } catch (aiOrNotError) {
        console.error('AIOrNot failed, using Gemini only:', aiOrNotError);
        // If AIOrNot fails, just use Gemini
        return {
          ...geminiAnalysis,
          gemini: geminiAnalysis,
          aiOrNot: null,
          dualVerification: false,
          timestamp: Date.now()
        };
      }
    }

    // Gemini is confident (below 40% or above 60%), use only Gemini
    console.log(`Gemini confident (${Math.round(confidence * 100)}%), using single verification`);
    return {
      ...geminiAnalysis,
      gemini: geminiAnalysis,
      aiOrNot: null,
      dualVerification: false,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('Error analyzing image:', error);
    // Return fallback result if analysis fails
    return {
      confidence: 0.5,
      flags: [{ text: 'Unable to complete analysis: ' + error.message, strength: 'low' }],
      realIndicators: [],
      gemini: null,
      aiOrNot: null,
      dualVerification: false,
      timestamp: Date.now()
    };
  }
}

// Fetch image and convert to base64
async function fetchImageAsBase64(imageUrl) {
  try {
    // Try direct fetch first
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Extract base64 data (remove "data:image/jpeg;base64," prefix)
        const base64 = reader.result.split(',')[1];
        resolve({
          base64Data: base64,
          mimeType: blob.type
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    // If direct fetch fails (CORS), try alternative method
    console.log('Direct fetch failed, trying alternative method:', error);

    try {
      // Try using chrome.tabs to capture the image from the page context
      // This bypasses CORS by getting the image data directly from the rendered page
      return await fetchImageViaPageContext(imageUrl);
    } catch (altError) {
      throw new Error('Failed to fetch image (CORS blocked): ' + error.message);
    }
  }
}

// Alternative method to fetch images when CORS blocks direct access
async function fetchImageViaPageContext(imageUrl) {
  // For CORS-blocked images, we can't fetch them directly
  // Instead, we'll use a canvas to extract the image data from the page
  // This requires sending a message to the content script

  // For now, throw a helpful error
  throw new Error('Image blocked by CORS. This site restricts image access.');
}

// Call Gemini API for AI detection analysis
async function analyzeWithGemini(imageData) {
  // Using v1beta API with API key in header (recommended approach)
  const apiUrl = PROXY_URL;

  // Craft detection prompt
  const prompt = `Analyze this image to determine if it's AI-generated or authentic/real.

Focus on these indicators:

AI GENERATION SIGNS:
- Anatomical impossibilities (extra/missing fingers, distorted faces)
- Perfect symmetry (too uniform to be handmade)
- Garbled or nonsensical text
- Inconsistent lighting/shadows
- Unnatural texture repetition
- Impossible physics or geometry
- Lack of depth/dimensional details
- Unnaturally smooth or plastic-looking surfaces

For crafts (crochet, knitting, sewing):
- Physically impossible stitch patterns
- No tension variations (handmade shows irregularities)
- Perfect color gradients (hard to achieve manually)
- Missing tool marks or human imperfections

AUTHENTIC/REAL SIGNS:
- Natural imperfections and asymmetry
- Consistent physical properties
- Readable, coherent text
- Realistic lighting and shadows
- Camera metadata or lens artifacts
- Texture depth and variation
- Human-scale imperfections

Respond in this EXACT JSON format (no other text):
{
  "confidence": 0.75,
  "aiIndicators": [
    {"text": "Extra finger on left hand", "strength": "high"},
    {"text": "Perfect symmetry in pattern", "strength": "medium"}
  ],
  "realIndicators": [
    {"text": "Natural color variations", "strength": "medium"}
  ],
  "reasoning": "Brief explanation of the determination"
}

Where:
- confidence: 0.0 (definitely real) to 1.0 (definitely AI)
- strength: "high", "medium", or "low"
- Include 2-5 indicators for each category if found
- reasoning: 1-2 sentences explaining the conclusion`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.base64Data
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.05,
      maxOutputTokens: 2048,
      topP: 0.8,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          confidence: { type: 'number' },
          aiIndicators: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                strength: { type: 'string', enum: ['high', 'medium', 'low'] }
              },
              required: ['text', 'strength']
            }
          },
          realIndicators: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                strength: { type: 'string', enum: ['high', 'medium', 'low'] }
              },
              required: ['text', 'strength']
            }
          },
          reasoning: { type: 'string' }
        },
        required: ['confidence', 'aiIndicators', 'realIndicators', 'reasoning']
      }
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Extract text from Gemini response
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('No response from Gemini');
    }

    return responseText;

  } catch (error) {
    throw new Error('Gemini API call failed: ' + error.message);
  }
}

// Call AIOrNot API for second opinion (when Gemini is uncertain)
async function analyzeWithAIOrNot(imageData) {
  console.log('Calling AIOrNot API for second opinion...');

  const apiUrl = 'https://api.aiornot.com/v1/reports/image';

  const requestBody = {
    object: `data:${imageData.mimeType};base64,${imageData.base64Data}`
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIORNOT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`AIOrNot API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    if (!data.report) {
      throw new Error('No report from AIOrNot');
    }

    return data.report;

  } catch (error) {
    throw new Error('AIOrNot API call failed: ' + error.message);
  }
}

// Sanitize a JSON string to fix common issues from Gemini output
function sanitizeJSON(text) {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (text.startsWith('json')) text = text.substring(4).trim();

  // Extract the outermost JSON object only
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.substring(first, last + 1);

  // Remove JavaScript-style single-line and block comments
  text = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Replace single-quoted string delimiters with double quotes
  // Only replace where single quotes are used as JSON string wrappers
  text = text.replace(/:\s*'([^']*)'/g, ': "$1"');
  text = text.replace(/,\s*'([^']*)'\s*:/g, ', "$1":');

  // Remove trailing commas before } or ]
  text = text.replace(/,(\s*[}\]])/g, '$1');

  // Escape unescaped newlines and tabs inside string values
  text = text.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  });

  // Close any unclosed arrays
  const openArr = (text.match(/\[/g) || []).length;
  const closeArr = (text.match(/\]/g) || []).length;
  text += ']'.repeat(Math.max(0, openArr - closeArr));

  // Close any unclosed braces
  const open = (text.match(/\{/g) || []).length;
  const close = (text.match(/\}/g) || []).length;
  text += '}'.repeat(Math.max(0, open - close));

  return text;
}

// Parse Gemini's JSON response into our format
function parseGeminiResponse(geminiText) {
  try {
    const jsonText = sanitizeJSON(geminiText);
    const parsed = JSON.parse(jsonText);

    // Convert to our format
    return {
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      flags: (parsed.aiIndicators || []).map(indicator => ({
        text: indicator.text,
        strength: indicator.strength || 'medium'
      })),
      realIndicators: (parsed.realIndicators || []).map(indicator => ({
        text: indicator.text,
        strength: indicator.strength || 'medium'
      })),
      reasoning: parsed.reasoning || ''
    };

  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    console.log('Raw response:', geminiText);

    // More aggressive fallback parsing
    try {
      // Try to extract just the confidence value and work with what we have
      const confidenceMatch = geminiText.match(/["|']?confidence["|']?\s*:\s*(\d+\.?\d*)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

      // Try to extract AI indicators array
      const aiIndicatorsMatch = geminiText.match(/["|']?aiIndicators["|']?\s*:\s*\[(.*?)\]/s);
      const flags = [];
      if (aiIndicatorsMatch) {
        const indicatorsText = aiIndicatorsMatch[1];
        const textMatches = [...indicatorsText.matchAll(/["|']?text["|']?\s*:\s*["|'](.*?)["|']/g)];
        const strengthMatches = [...indicatorsText.matchAll(/["|']?strength["|']?\s*:\s*["|'](.*?)["|']/g)];

        for (let i = 0; i < textMatches.length; i++) {
          flags.push({
            text: textMatches[i][1],
            strength: strengthMatches[i] ? strengthMatches[i][1] : 'medium'
          });
        }
      }

      // Try to extract real indicators
      const realIndicatorsMatch = geminiText.match(/["|']?realIndicators["|']?\s*:\s*\[(.*?)(\]|$)/s);
      const realIndicators = [];
      if (realIndicatorsMatch) {
        const indicatorsText = realIndicatorsMatch[1];
        const textMatches = [...indicatorsText.matchAll(/["|']?text["|']?\s*:\s*["|']([^"']*)["|']?/g)];

        for (const match of textMatches) {
          if (match[1] && match[1].trim()) {
            realIndicators.push({ text: match[1], strength: 'medium' });
          }
        }
      }

      // Try to extract reasoning
      const reasoningMatch = geminiText.match(/["|']?reasoning["|']?\s*:\s*["|']([^"']*)["|']?/s);
      const reasoning = reasoningMatch ? reasoningMatch[1] : '';

      return {
        confidence: confidence > 1 ? confidence / 100 : confidence,
        flags: flags.length > 0 ? flags : [{ text: 'Analysis completed', strength: 'low' }],
        realIndicators: realIndicators,
        reasoning: reasoning
      };
    } catch (fallbackError) {
      console.error('Fallback parsing also failed:', fallbackError);

      // Last resort: return minimal info
      return {
        confidence: 0.5,
        flags: [{ text: 'Unable to fully parse analysis', strength: 'low' }],
        realIndicators: [],
        reasoning: 'Analysis was incomplete. Please try again.'
      };
    }
  }
}

// Parse AIOrNot's response into our format
function parseAIOrNotResponse(aiOrNotReport) {
  try {
    // AIOrNot returns a report with verdict and confidence
    // Example: { verdict: "ai", confidence: "high", score: 0.85 }

    let confidence = 0.5;

    // Convert AIOrNot's verdict to confidence score
    if (aiOrNotReport.verdict === 'ai' || aiOrNotReport.verdict === 'AI') {
      // AI detected - use high confidence
      if (aiOrNotReport.confidence === 'high') {
        confidence = 0.85;
      } else if (aiOrNotReport.confidence === 'medium') {
        confidence = 0.70;
      } else {
        confidence = 0.60;
      }
    } else if (aiOrNotReport.verdict === 'human' || aiOrNotReport.verdict === 'real') {
      // Real/human detected - use low confidence (meaning not AI)
      if (aiOrNotReport.confidence === 'high') {
        confidence = 0.15;
      } else if (aiOrNotReport.confidence === 'medium') {
        confidence = 0.30;
      } else {
        confidence = 0.40;
      }
    }

    // If they provide a direct score, use that
    if (aiOrNotReport.score !== undefined) {
      confidence = aiOrNotReport.score;
    }

    // Build indicators
    const flags = [];
    const realIndicators = [];

    if (confidence > 0.6) {
      flags.push({
        text: `AIOrNot verdict: ${aiOrNotReport.verdict || 'AI detected'}`,
        strength: aiOrNotReport.confidence || 'medium'
      });

      if (aiOrNotReport.reason) {
        flags.push({
          text: aiOrNotReport.reason,
          strength: 'medium'
        });
      }
    } else {
      realIndicators.push({
        text: `AIOrNot verdict: ${aiOrNotReport.verdict || 'Human/Real'}`,
        strength: aiOrNotReport.confidence || 'medium'
      });
    }

    return {
      confidence: Math.max(0, Math.min(1, confidence)),
      flags: flags,
      realIndicators: realIndicators,
      reasoning: aiOrNotReport.reason || `AIOrNot confidence: ${aiOrNotReport.confidence || 'unknown'}`
    };

  } catch (error) {
    console.error('Failed to parse AIOrNot response:', error);
    return {
      confidence: 0.5,
      flags: [{ text: 'AIOrNot analysis completed but formatting unclear', strength: 'low' }],
      realIndicators: [],
      reasoning: 'Unable to parse AIOrNot response'
    };
  }
}

// Combine Gemini and AIOrNot analyses into one result
function combineAnalyses(geminiAnalysis, aiOrNotAnalysis) {
  // Calculate weighted average (Gemini 60%, AIOrNot 40%)
  // We trust Gemini more since it gives detailed reasoning
  const combinedConfidence = (geminiAnalysis.confidence * 0.6) + (aiOrNotAnalysis.confidence * 0.4);

  // Combine all indicators
  const allFlags = [
    ...geminiAnalysis.flags.map(f => ({ ...f, source: 'Gemini' })),
    ...aiOrNotAnalysis.flags.map(f => ({ ...f, source: 'AIOrNot' }))
  ];

  const allRealIndicators = [
    ...geminiAnalysis.realIndicators.map(r => ({ ...r, source: 'Gemini' })),
    ...aiOrNotAnalysis.realIndicators.map(r => ({ ...r, source: 'AIOrNot' }))
  ];

  // Calculate agreement level
  const confidenceDiff = Math.abs(geminiAnalysis.confidence - aiOrNotAnalysis.confidence);
  let agreement;
  if (confidenceDiff < 0.15) {
    agreement = 'Strong agreement';
  } else if (confidenceDiff < 0.30) {
    agreement = 'Moderate agreement';
  } else {
    agreement = 'Disagreement';
  }

  // Combine reasoning
  const combinedReasoning = `Combined Analysis (${agreement}):\n\n` +
    `Gemini (${Math.round(geminiAnalysis.confidence * 100)}%): ${geminiAnalysis.reasoning}\n\n` +
    `AIOrNot (${Math.round(aiOrNotAnalysis.confidence * 100)}%): ${aiOrNotAnalysis.reasoning}`;

  return {
    confidence: combinedConfidence,
    flags: allFlags,
    realIndicators: allRealIndicators,
    reasoning: combinedReasoning,
    agreement: agreement
  };
}

// Store analysis results for future reference
async function storeAnalysisResult(imageUrl, analysis) {
  try {
    const data = await chrome.storage.local.get('analysisHistory');
    const history = data.analysisHistory || [];

    history.push({
      url: imageUrl,
      analysis,
      timestamp: Date.now()
    });

    // Keep only last 100 analyses
    if (history.length > 100) {
      history.shift();
    }

    await chrome.storage.local.set({ analysisHistory: history });
  } catch (error) {
    console.error('Error storing analysis:', error);
  }
}
