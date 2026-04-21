// Popup script for extension icon click

// Existing navigation buttons
document.getElementById('openFacebook').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.facebook.com' });
});

document.getElementById('openTwitter').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://x.com' });
});

document.getElementById('learnMore').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://getcyphr.com' });
});

document.getElementById('reportIssue').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://forms.gle/Uzk4enqQRzyStxSA8' });
});

// NEW: Upload functionality
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const analyzeButton = document.getElementById('analyzeUpload');
const resultsContainer = document.getElementById('uploadResults');

// Handle file selection
imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Show preview
  const reader = new FileReader();
  reader.onload = (event) => {
    imagePreview.src = event.target.result;
    imagePreview.classList.add('show');
    analyzeButton.classList.add('show');
    resultsContainer.classList.remove('show');
    resultsContainer.innerHTML = '';
  };
  reader.readAsDataURL(file);
});

// Handle analyze button click
analyzeButton.addEventListener('click', async () => {
  const file = imageUpload.files[0];
  if (!file) return;

  // Disable button and show loading state
  analyzeButton.disabled = true;
  analyzeButton.textContent = '⏳ Analyzing...';

  try {
    // Convert file to base64
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Extract base64 data (remove data:image/...;base64, prefix)
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Send to background script for analysis
    const response = await chrome.runtime.sendMessage({
      action: 'analyzeUploadedImage',
      imageData: {
        base64Data: base64Data,
        mimeType: file.type
      }
    });

    if (response.success) {
      displayResults(response.analysis);
    } else {
      showError(response.error || 'Analysis failed');
    }

  } catch (error) {
    console.error('Upload analysis error:', error);
    showError(error.message);
  } finally {
    // Re-enable button
    analyzeButton.disabled = false;
    analyzeButton.textContent = '🔍 Analyze Image';
  }
});

// Display analysis results
function displayResults(analysis) {
  const percentage = Math.round(analysis.confidence * 100);
  const isLikelyAI = percentage >= 60;

  let html = `
    <div class="result-percentage ${isLikelyAI ? 'likely-ai' : 'likely-real'}">
      ${percentage}%
    </div>
    <div class="result-label">
      ${isLikelyAI ? '⚠️ Likely AI-Generated' : '✓ Likely Authentic'}
    </div>
    
    <div class="result-bar">
      <div class="result-bar-fill" style="width: ${percentage}%"></div>
    </div>
  `;

  // AI Indicators
  if (analysis.flags && analysis.flags.length > 0) {
    html += `
      <div class="result-section">
        <div class="result-section-title">⚠️ AI Indicators:</div>
        ${analysis.flags.map(flag => `
          <div class="result-item">
            <span>${flag.text}</span>
            <span class="result-badge badge-${flag.strength}">${flag.strength}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Real Indicators
  if (analysis.realIndicators && analysis.realIndicators.length > 0) {
    html += `
      <div class="result-section">
        <div class="result-section-title">✓ Authentic Indicators:</div>
        ${analysis.realIndicators.map(indicator => `
          <div class="result-item">
            <span>${indicator.text}</span>
            <span class="result-badge badge-low">${indicator.strength}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Reasoning
  if (analysis.reasoning) {
    html += `
      <div class="result-section">
        <div class="result-section-title">💡 Analysis:</div>
        <div class="result-reasoning">${analysis.reasoning}</div>
      </div>
    `;
  }

  resultsContainer.innerHTML = html;
  resultsContainer.classList.add('show');
}

// Show error message
function showError(message) {
  resultsContainer.innerHTML = `
    <div class="result-section">
      <div class="result-section-title">❌ Error:</div>
      <div class="result-reasoning">${message}</div>
    </div>
  `;
  resultsContainer.classList.add('show');
}
