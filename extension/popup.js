// CYPHR Extension Popup — wired to Gemini API via background.js

const imageUpload = document.getElementById('imageUpload');
const imageStrip = document.getElementById('image-strip');
const previewImg = document.getElementById('preview-img');
const stripPlaceholder = document.getElementById('strip-placeholder');
const headerMeta = document.getElementById('header-meta');
const vfOverlay = document.getElementById('vf-overlay');
const scanBar = document.getElementById('scan-bar');
const scanTint = document.getElementById('scan-tint');
const content = document.getElementById('content');
const footer = document.getElementById('popup-footer');

// Generate a scan ID like 0422-CYP-3B9E
function generateScanId() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hex = Math.random().toString(16).substring(2, 6).toUpperCase();
  return `${month}${day}-CYP-${hex}`;
}

// ============ STATE: IDLE ============
function showIdle() {
  headerMeta.textContent = 'Ready';
  stripPlaceholder.style.display = 'block';
  stripPlaceholder.textContent = 'Click to select image';
  previewImg.classList.remove('show');
  vfOverlay.style.display = 'none';
  scanBar.style.display = 'none';
  scanTint.style.display = 'none';
  imageUpload.value = '';

  content.innerHTML = `
    <div class="idle-prompt">
      <div class="idle-icon">
        <svg viewBox="0 0 22 22" fill="none">
          <circle cx="9" cy="9" r="6" stroke="rgba(124,58,237,0.7)" stroke-width="1.5"/>
          <line x1="13.5" y1="13.5" x2="20" y2="20" stroke="rgba(124,58,237,0.7)" stroke-width="1.5" stroke-linecap="square"/>
        </svg>
      </div>
      <div class="idle-headline">Nothing scanned yet.</div>
      <div class="idle-sub">Upload an image to scan, or hover any image on a webpage and click "Is this AI?"</div>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn btn-primary" id="btn-upload">Upload image →</button>
    <button class="btn btn-ghost" id="btn-learn">Visit website</button>
  `;

  document.getElementById('btn-upload').addEventListener('click', () => imageUpload.click());
  document.getElementById('btn-learn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://getcyphr.com' });
  });
}

// ============ STATE: SCANNING ============
function showScanning() {
  headerMeta.textContent = 'Scanning\u2026';
  stripPlaceholder.style.display = 'none';
  vfOverlay.style.display = 'block';
  scanBar.style.display = 'block';
  scanTint.style.display = 'block';

  content.innerHTML = `
    <div class="scanning-status">
      <div class="scan-label">
        <span class="txt">Analyzing</span>
        <span class="dots"><span></span><span></span><span></span></span>
      </div>
      <div class="progress-track"><div class="progress-fill"></div></div>
      <div class="scan-steps">
        <div class="step done"><span class="step-dot"></span>Image loaded</div>
        <div class="step done"><span class="step-dot"></span>Metadata extracted</div>
        <div class="step active"><span class="step-dot"></span>AI signature check</div>
        <div class="step"><span class="step-dot"></span>Confidence scored</div>
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn btn-primary" disabled>Scanning\u2026</button>
    <button class="btn btn-ghost" id="btn-cancel">Cancel</button>
  `;

  document.getElementById('btn-cancel').addEventListener('click', showIdle);
}

// ============ STATE: RESULT ============
function showResult(analysis) {
  const percentage = Math.round(analysis.confidence * 100);
  const isAI = percentage >= 60;
  const type = isAI ? 'ai' : 'authentic';
  const scanId = generateScanId();

  headerMeta.textContent = 'Verdict ready';
  scanBar.style.display = 'none';
  scanTint.style.display = 'none';
  vfOverlay.style.display = 'block';

  // Build indicator rows from flags and realIndicators
  const allIndicators = [
    ...(analysis.flags || []).map(f => ({ label: f.text, strength: f.strength, type: 'ai' })),
    ...(analysis.realIndicators || []).map(r => ({ label: r.text, strength: r.strength || 'low', type: 'real' }))
  ];

  const maxVisible = 3;
  const visible = allIndicators.slice(0, maxVisible);
  const hidden = allIndicators.slice(maxVisible);

  // Build meta rows from visible indicators
  let metaHtml = visible.map(ind => `
    <div class="meta-row">
      <span class="k">${ind.type === 'ai' ? 'AI Sign' : 'Authentic'}</span>
      <span class="v">${ind.label}</span>
    </div>
  `).join('');

  // Add scan ID row
  metaHtml += `<div class="meta-row"><span class="k">Scan ID</span><span class="v">${scanId}</span></div>`;

  // Hidden rows
  let hiddenHtml = '';
  if (hidden.length > 0 || analysis.reasoning) {
    hiddenHtml = `<div class="meta-rows-hidden" id="hidden-rows">`;
    hiddenHtml += hidden.map(ind => `
      <div class="meta-row">
        <span class="k">${ind.type === 'ai' ? 'AI Sign' : 'Authentic'}</span>
        <span class="v">${ind.label}</span>
      </div>
    `).join('');
    if (analysis.reasoning) {
      hiddenHtml += `<div class="meta-row"><span class="k">Analysis</span><span class="v" style="max-width:200px;white-space:normal;line-height:1.4;">${analysis.reasoning}</span></div>`;
    }
    hiddenHtml += `</div>`;
    hiddenHtml += `<button class="show-more-toggle" id="toggle-more">Show more ▾</button>`;
  }

  const verdictLabel = isAI
    ? "Something's off about this image."
    : "This image wasn't made by AI.";

  const explanation = analysis.reasoning || (isAI
    ? 'AI generation patterns were detected in this image.'
    : 'No AI generation artifacts were detected.');

  // Only show first sentence of explanation in the card
  const shortExplanation = explanation.split('. ').slice(0, 2).join('. ') + '.';

  content.innerHTML = `
    <div class="verdict-card ${type}">
      <div class="verdict-top">
        <span class="chip ${type}"><span class="chip-dot"></span>${isAI ? 'AI-Generated' : 'Authentic'}</span>
        <span class="confidence ${type}">${percentage}%</span>
      </div>
      <div class="verdict-label">${verdictLabel}</div>
      <div class="score-bar"><div class="score-fill ${type}" style="width:${percentage}%;"></div></div>
      <div class="verdict-explanation">${shortExplanation}</div>
      <div class="meta-rows">${metaHtml}</div>
      ${hiddenHtml}
    </div>
  `;

  footer.innerHTML = `
    <button class="btn btn-primary" id="btn-another">Scan another →</button>
    <button class="btn btn-ghost" id="btn-report">Report</button>
  `;

  document.getElementById('btn-another').addEventListener('click', showIdle);
  document.getElementById('btn-report').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://forms.gle/Uzk4enqQRzyStxSA8' });
  });

  // Toggle hidden rows
  const toggleBtn = document.getElementById('toggle-more');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const rows = document.getElementById('hidden-rows');
      const isHidden = !rows.classList.contains('show');
      rows.classList.toggle('show');
      toggleBtn.textContent = isHidden ? 'Show less ▴' : 'Show more ▾';
    });
  }
}

// ============ STATE: ERROR ============
function showError(message) {
  const scanId = generateScanId();

  headerMeta.textContent = 'Error';
  scanBar.style.display = 'none';
  scanTint.style.display = 'none';

  content.innerHTML = `
    <div class="error-block">
      <div class="error-title">Scan failed.</div>
      <div class="error-msg">${message}</div>
      <div class="error-code">ERR_ANALYSIS_FAILED · ${scanId}</div>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn btn-primary" id="btn-retry">Try again →</button>
    <button class="btn btn-ghost" id="btn-dismiss">Dismiss</button>
  `;

  document.getElementById('btn-retry').addEventListener('click', () => imageUpload.click());
  document.getElementById('btn-dismiss').addEventListener('click', showIdle);
}

// ============ FILE UPLOAD HANDLER ============
// Clicking the image strip also triggers upload
imageStrip.addEventListener('click', () => {
  // Only trigger in idle state (when placeholder is visible)
  if (stripPlaceholder.style.display !== 'none') {
    imageUpload.click();
  }
});

imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Show preview
  const reader = new FileReader();
  reader.onload = (event) => {
    previewImg.src = event.target.result;
    previewImg.classList.add('show');
    stripPlaceholder.style.display = 'none';

    // Go straight to scanning
    showScanning();
    analyzeImage(file);
  };
  reader.readAsDataURL(file);
});

// ============ IMAGE COMPRESSION ============
async function compressImage(file, maxDimension = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) { height = Math.round(height * maxDimension / width); width = maxDimension; }
          else { width = Math.round(width * maxDimension / height); height = maxDimension; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64Data: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============ ANALYSIS ============
async function analyzeImage(file) {
  try {
    // Compress image before sending to stay under Vercel's 4.5MB body limit
    const { base64Data, mimeType } = await compressImage(file);

    // Send to background.js → Gemini API
    const response = await chrome.runtime.sendMessage({
      action: 'analyzeUploadedImage',
      imageData: { base64Data, mimeType }
    });

    if (response.success) {
      showResult(response.analysis);
    } else {
      showError(response.error || 'Analysis failed. Please try again.');
    }

  } catch (error) {
    console.error('Analysis error:', error);
    showError(error.message || 'An unexpected error occurred.');
  }
}

// ============ INIT ============
showIdle();
