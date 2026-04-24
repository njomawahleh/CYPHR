// Content script that runs on multiple platforms
// Adds "Check if AI" buttons to images on hover (1 second delay)

console.log('AI Detector: Content script loaded');

// Configuration for different platforms
const PLATFORMS = {
  facebook: {
    domain: 'facebook.com',
    imageSelector: 'img[src*="scontent"]',
    postSelector: 'div[data-pagelet^="FeedUnit"]',
    buttonInsertTarget: (img) => img.closest('div[role="button"]')?.parentElement || img.parentElement
  },
  twitter: {
    domain: 'x.com',
    imageSelector: 'img[src*="pbs.twimg.com"]',
    postSelector: 'article[data-testid="tweet"]',
    buttonInsertTarget: (img) => img.closest('div[data-testid="tweetPhoto"]') || img.parentElement
  },
  etsy: {
    domain: 'etsy.com',
    imageSelector: 'img[data-listing-id], img.listing-link-image, img[src*="i.etsystatic.com"]',
    postSelector: 'div[data-listing-id], li[data-listing-id]',
    buttonInsertTarget: (img) => {
      // Try to find the listing card container
      const listingCard = img.closest('div[data-listing-id]') || img.closest('li[data-listing-id]');
      return listingCard || img.parentElement;
    }
  },
  ribblr: {
    domain: 'ribblr.com',
    imageSelector: 'img[src*="ribblr"], img.pattern-image, img[alt*="pattern"]',
    postSelector: 'div.pattern-card, article',
    buttonInsertTarget: (img) => {
      const patternCard = img.closest('div.pattern-card') || img.closest('article');
      return patternCard || img.parentElement;
    }
  },
  ravelry: {
    domain: 'ravelry.com',
    imageSelector: 'img[src*="ravelry"], img.pattern-image, img[src*="images4-"]',
    postSelector: 'div.pattern, div.project',
    buttonInsertTarget: (img) => {
      const container = img.closest('div.pattern') || img.closest('div.project');
      return container || img.parentElement;
    }
  },
  instagram: {
    domain: 'instagram.com',
    imageSelector: 'img[src*="cdninstagram"]',
    postSelector: 'article',
    buttonInsertTarget: (img) => img.parentElement
  },
  pinterest: {
    domain: 'pinterest.com',
    imageSelector: 'img[src*="pinimg.com"]',
    postSelector: 'div[data-test-id="pin"]',
    buttonInsertTarget: (img) => {
      const pinCard = img.closest('div[data-test-id="pin"]');
      return pinCard || img.parentElement;
    }
  },
  reddit: {
    domain: 'reddit.com',
    imageSelector: 'img[src*="redd.it"], img[src*="reddit.com"]',
    postSelector: 'div[data-testid="post-container"]',
    buttonInsertTarget: (img) => {
      const postContainer = img.closest('div[data-testid="post-container"]');
      return postContainer || img.parentElement;
    }
  },
  // Universal fallback for any other site
  universal: {
    domain: '*',
    imageSelector: 'img',
    postSelector: 'div, article, section',
    buttonInsertTarget: (img) => img.parentElement
  }
};

// Detect which platform we're on
function getCurrentPlatform() {
  const hostname = window.location.hostname;
  
  // Check for specific platforms
  if (hostname.includes('facebook')) return PLATFORMS.facebook;
  if (hostname.includes('x.com') || hostname.includes('twitter')) return PLATFORMS.twitter;
  if (hostname.includes('etsy')) return PLATFORMS.etsy;
  if (hostname.includes('ribblr')) return PLATFORMS.ribblr;
  if (hostname.includes('ravelry')) return PLATFORMS.ravelry;
  if (hostname.includes('instagram')) return PLATFORMS.instagram;
  if (hostname.includes('pinterest')) return PLATFORMS.pinterest;
  if (hostname.includes('reddit')) return PLATFORMS.reddit;
  
  // Fallback to universal mode for any other site
  return PLATFORMS.universal;
}

// Create the "Is this AI?" button, centered over the image
function createCheckButton(imageElement) {
  const button = document.createElement('button');
  button.className = 'ai-detector-check-btn';
  const iconUrl = chrome.runtime.getURL('icons/icon16.png');
  button.innerHTML = `<img src="${iconUrl}" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"> Is this AI?`;
  button.title = 'Analyze this image for AI generation';

  // Position fixed, centered over the image
  const rect = imageElement.getBoundingClientRect();
  button.style.position = 'fixed';
  button.style.left = `${rect.left + rect.width / 2}px`;
  button.style.top = `${rect.top + rect.height / 2}px`;
  button.style.transform = 'translate(-50%, -50%)';
  button.style.zIndex = '2147483646';

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await analyzeImage(imageElement, button);
  });

  return button;
}

// Create the results display
function createResultsDisplay(analysis, imageElement) {
  const container = document.createElement('div');
  container.className = 'ai-detector-results';

  // Position the card near the image, fixed in viewport
  const rect = imageElement.getBoundingClientRect();
  const cardWidth = 380;
  const margin = 20;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.right + 12;
  if (left + cardWidth > viewportWidth - margin) {
    left = rect.left - cardWidth - 12;
  }
  if (left < margin) {
    left = Math.max(margin, (viewportWidth - cardWidth) / 2);
  }

  let top = Math.max(margin, rect.top);
  const maxHeight = viewportHeight - top - margin;

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
  container.style.maxHeight = `${maxHeight}px`;

  const percentage = Math.round(analysis.confidence * 100);
  const isLikelyAI = percentage >= 60;
  const verdictClass = isLikelyAI ? 'vc-ai' : 'vc-authentic';
  const chipClass = isLikelyAI ? 'chip-ai' : 'chip-authentic';
  const pctClass = isLikelyAI ? 'pct-ai' : 'pct-authentic';
  const barClass = isLikelyAI ? 'sf-ai' : 'sf-authentic';

  const hasDualVerification = analysis.dualVerification && analysis.gemini && analysis.aiOrNot;

  // --- Header bar with lettermark ---
  let html = `
    <div class="ai-detector-header-bar">
      <div class="ai-detector-brand">
        <div class="ai-detector-lettermark">
          <span class="lm-c">C</span>
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 8V1H8" stroke="#7C3AED" stroke-width="1.5"/>
            <path d="M20 1H27V8" stroke="#7C3AED" stroke-width="1.5"/>
            <path d="M27 20V27H20" stroke="#7C3AED" stroke-width="1.5"/>
            <path d="M8 27H1V20" stroke="#7C3AED" stroke-width="1.5"/>
          </svg>
        </div>
        <span class="ai-detector-wordmark">CYPHR</span>
      </div>
      <span class="ai-detector-status">Verdict Ready</span>
    </div>
    <button class="ai-detector-close" title="Close">✕</button>
  `;

  // --- Verdict card ---
  html += `
    <div class="ai-detector-verdict ${verdictClass}">
      <div class="ai-detector-verdict-top">
        <span class="ai-detector-chip ${chipClass}">
          <span class="chip-dot"></span>
          ${isLikelyAI ? 'AI-Generated' : 'Authentic'}
        </span>
        <span class="ai-detector-percentage ${pctClass}">${percentage}%</span>
      </div>
      <div class="ai-detector-headline">${isLikelyAI ? 'Likely AI-Generated' : 'Likely Authentic'}</div>
      <div class="ai-detector-bar">
        <div class="ai-detector-bar-fill ${barClass}" style="width:${percentage}%"></div>
      </div>
      ${analysis.reasoning ? `<div class="ai-detector-explanation">${analysis.reasoning}</div>` : ''}
  `;

  // --- Meta rows for indicators (inside verdict card) ---
  const allIndicators = [
    ...(analysis.flags || []).map(f => ({ ...f, type: 'ai' })),
    ...(analysis.realIndicators || []).map(r => ({ ...r, type: 'real' }))
  ];

  const maxVisible = 3;
  const visibleInds = allIndicators.slice(0, maxVisible);
  const hiddenInds = allIndicators.slice(maxVisible);
  const hasMore = hiddenInds.length > 0;

  if (visibleInds.length > 0) {
    html += `<div class="ai-detector-rows">`;
    html += visibleInds.map(ind => `
      <div class="ai-detector-row">
        <span class="row-k">${ind.text}</span>
        <span class="row-v">${ind.strength || ''}</span>
      </div>
    `).join('');
    html += `</div>`;
  }

  // Close verdict card
  html += `</div>`;

  // --- Dual verification section ---
  if (hasDualVerification) {
    const geminiPct = Math.round(analysis.gemini.confidence * 100);
    const aiOrNotPct = Math.round(analysis.aiOrNot.confidence * 100);

    let agreeClass = 'agree-strong';
    if (analysis.agreement === 'Moderate agreement') agreeClass = 'agree-moderate';
    else if (analysis.agreement === 'Disagreement') agreeClass = 'agree-disagree';

    html += `
      <div style="padding:0 18px 12px;">
        <div class="ai-detector-dual-badge">
          <span class="chip-dot" style="background:var(--cyphr-violet);width:5px;height:5px;border-radius:50%;display:inline-block;"></span>
          Dual Verification
        </div>
        <div class="ai-detector-sources">
          <div class="ai-detector-source">
            <div class="ai-detector-source-name">Gemini</div>
            <div class="ai-detector-source-pct ${geminiPct >= 60 ? 'pct-ai' : 'pct-authentic'}">${geminiPct}%</div>
          </div>
          <div class="ai-detector-source">
            <div class="ai-detector-source-name">AIOrNot</div>
            <div class="ai-detector-source-pct ${aiOrNotPct >= 60 ? 'pct-ai' : 'pct-authentic'}">${aiOrNotPct}%</div>
          </div>
        </div>
        <div class="ai-detector-agreement ${agreeClass}">${analysis.agreement || 'Analysis complete'}</div>
      </div>
    `;
  }

  // --- Hidden indicators + show more ---
  if (hasMore) {
    html += `
      <div class="ai-detector-hidden-section" style="display:none;padding:0 18px;">
        <div class="ai-detector-rows" style="border-top:none;">
          ${hiddenInds.map(ind => `
            <div class="ai-detector-row">
              <span class="row-k">${ind.text}</span>
              <span class="row-v">${ind.strength || ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <a href="#" class="ai-detector-show-more">Show more ▾</a>
    `;
  }

  // --- Footer ---
  html += `
    <div class="ai-detector-footer">
      <button class="ai-detector-learn-more">About</button>
      <button class="ai-detector-report">Report</button>
    </div>
  `;

  container.innerHTML = html;

  // --- Event listeners ---
  const dismiss = () => {
    container.remove();
    document.removeEventListener('mousedown', handleOutsideClick);
  };

  container.querySelector('.ai-detector-close').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  });

  const showMoreToggle = container.querySelector('.ai-detector-show-more');
  if (showMoreToggle) {
    const hiddenSection = container.querySelector('.ai-detector-hidden-section');
    showMoreToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = hiddenSection.style.display === 'none';
      hiddenSection.style.display = isHidden ? 'block' : 'none';
      showMoreToggle.textContent = isHidden ? 'Show less ▴' : 'Show more ▾';
    });
  }

  container.querySelector('.ai-detector-learn-more').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'openLearnMore' });
  });

  container.querySelector('.ai-detector-report').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open('https://forms.gle/Uzk4enqQRzyStxSA8', '_blank');
  });

  document.body.appendChild(container);

  const handleOutsideClick = (e) => {
    if (!container.contains(e.target)) dismiss();
  };
  setTimeout(() => document.addEventListener('mousedown', handleOutsideClick), 0);

  return container;
}

// Analyze the image
async function analyzeImage(imageElement, button) {
  const imageUrl = imageElement.src;
  
  // Show loading state
  button.innerHTML = '⏳ Analyzing...';
  button.disabled = true;
  
  try {
    // Send message to background script to analyze
    const response = await chrome.runtime.sendMessage({
      action: 'analyzeImage',
      imageUrl: imageUrl
    });
    
    if (response.success) {
      // Remove button and show results
      button.remove();
      createResultsDisplay(response.analysis, imageElement);
    } else {
      button.innerHTML = '❌ Analysis Failed';
      setTimeout(() => {
        button.innerHTML = '🔍 Check if AI';
        button.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error('AI Detector: Analysis error', error);
    button.innerHTML = '❌ Error';
    setTimeout(() => {
      button.innerHTML = '🔍 Check if AI';
      button.disabled = false;
    }, 2000);
  }
}

// Add hover listeners to images (button appears after 1 second hover)
function addButtonsToImages() {
  const platform = getCurrentPlatform();
  if (!platform) return;
  
  const images = document.querySelectorAll(platform.imageSelector);
  
  images.forEach(img => {
    // Skip if hover listener already added
    if (img.dataset.aiDetectorProcessed) return;
    
    // Skip tiny images (likely icons, avatars, etc.)
    // Use looser constraints for craft sites where thumbnails matter
    const minSize = platform.domain === 'universal' ? 150 : 200;
    if (img.naturalWidth < minSize || img.naturalHeight < minSize) return;
    
    // Skip common UI elements (logos, icons, etc.)
    if (img.alt && (
      img.alt.toLowerCase().includes('logo') ||
      img.alt.toLowerCase().includes('icon') ||
      img.alt.toLowerCase().includes('avatar')
    )) return;
    
    img.dataset.aiDetectorProcessed = 'true';
    
    // Store hover state on the image element
    img.aiDetectorHoverTimeout = null;
    img.aiDetectorButton = null;
    
    img.addEventListener('mouseenter', () => {
      // Start 1-second timer
      img.aiDetectorHoverTimeout = setTimeout(() => {
        // Only add button if not already present
        if (!img.aiDetectorButton) {
          {
            img.aiDetectorButton = createCheckButton(img);
            document.body.appendChild(img.aiDetectorButton);
            
            // Add hover listener to the button itself to keep it visible
            img.aiDetectorButton.addEventListener('mouseenter', () => {
              // Clear any pending removal timeout
              if (img.aiDetectorRemoveTimeout) {
                clearTimeout(img.aiDetectorRemoveTimeout);
                img.aiDetectorRemoveTimeout = null;
              }
            });
            
            img.aiDetectorButton.addEventListener('mouseleave', () => {
              // Remove button after leaving button area
              img.aiDetectorRemoveTimeout = setTimeout(() => {
                if (img.aiDetectorButton && img.aiDetectorButton.parentElement && !img.aiDetectorButton.disabled) {
                  img.aiDetectorButton.remove();
                  img.aiDetectorButton = null;
                }
              }, 300);
            });
          }
        }
      }, 1000); // 1000ms = 1 second
    });
    
    img.addEventListener('mouseleave', () => {
      // Clear timer if user moves away before 1 second
      if (img.aiDetectorHoverTimeout) {
        clearTimeout(img.aiDetectorHoverTimeout);
        img.aiDetectorHoverTimeout = null;
      }
      
      // Remove button after a short delay if user leaves image
      // This gives them time to move cursor to the button
      if (img.aiDetectorButton && !img.aiDetectorButton.disabled) {
        img.aiDetectorRemoveTimeout = setTimeout(() => {
          if (img.aiDetectorButton && img.aiDetectorButton.parentElement) {
            img.aiDetectorButton.remove();
            img.aiDetectorButton = null;
          }
        }, 300); // Keep button visible for 300ms after mouse leaves image
      }
    });
  });
}

// Watch for new images loading (infinite scroll, dynamic content)
function observeNewContent() {
  const observer = new MutationObserver((mutations) => {
    // Debounce: wait a bit before processing
    clearTimeout(window.aiDetectorTimeout);
    window.aiDetectorTimeout = setTimeout(addButtonsToImages, 500);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize when page loads
function initialize() {
  console.log('AI Detector: Initializing on', window.location.hostname);
  
  // Add hover listeners to existing images
  addButtonsToImages();
  
  // Watch for new content
  observeNewContent();
  
  console.log('AI Detector: Ready');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
