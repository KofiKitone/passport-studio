import { removeBackground } from "@imgly/background-removal";

const DPI = 300;
  const MM_TO_PX = DPI / 25.4;
  const PHOTO_W_MM = 35, PHOTO_H_MM = 45;
  const PHOTO_W_PX = Math.round(PHOTO_W_MM * MM_TO_PX); // Strictly 413 px
  const PHOTO_H_PX = Math.round(PHOTO_H_MM * MM_TO_PX); // Strictly 531 px
  const ASPECT = PHOTO_W_PX / PHOTO_H_PX;
  const SUPERSAMPLE = 4;

  // KP-108IN: 100 x 148 mm borderless at 300 DPI
  const SHEET_W_PX = Math.round(100 * MM_TO_PX); // 1181 px
  const SHEET_H_PX = Math.round(148 * MM_TO_PX); // 1748 px
  const SHEET_W_MM = 100, SHEET_H_MM = 148;

  const SPEC = {
    headMinPct: 0.60, headMaxPct: 0.78,
    eyeMinPct: 0.50, eyeMaxPct: 0.65,
    centerTolPct: 0.06,
  };

  const fileInput       = document.getElementById('fileInput');
  const fileDrop        = document.getElementById('fileDrop');
  const stage           = document.getElementById('stage');
  const photo           = document.getElementById('photo');
  const cropBox         = document.getElementById('cropBox');
  const controls        = document.getElementById('controls');
  const borderRange     = document.getElementById('borderRange');
  const borderVal       = document.getElementById('borderVal');
  const gapRange        = document.getElementById('gapRange');
  const gapVal          = document.getElementById('gapVal');
  const qualityRange    = document.getElementById('qualityRange');
  const qualityVal      = document.getElementById('qualityVal');
  const colorOptions    = document.getElementById('colorOptions');
  const bgToggle        = document.getElementById('bgToggle');
  const bgPanel         = document.getElementById('bgPanel');
  const bgColorOptions  = document.getElementById('bgColorOptions');
  const removeBgBtn     = document.getElementById('removeBgBtn');
  const bgStatus        = document.getElementById('bgStatus');
  const formatOptions   = document.getElementById('formatOptions');
  const result          = document.getElementById('result');
  const resultInfo      = document.getElementById('resultInfo');
  const downloadBtn     = document.getElementById('downloadBtn');
  const downloadSheetBtn= document.getElementById('downloadSheetBtn');
  const renderBtn       = document.getElementById('renderBtn');
  const autoFitBtn      = document.getElementById('autoFitBtn');
  const autoBadge       = document.getElementById('autoBadge');
  const copyOptions     = document.getElementById('copyOptions');
  const sheetHint       = document.getElementById('sheetHint');
  const ctx             = result.getContext('2d');

  let box = { x: 0, y: 0, w: 0, h: 0 };
  let currentImageName = 'passport-photo';
  let borderColor = '#ffffff';
  let bgColor = '#ffffff';
  let photoBitmap = null;
  let backgroundRemovedBitmap = null;
  let sourceFile = null;
  let detectedFace = null;
  let sheetCopies = 4;
  let outputFormat = 'image/jpeg';
  let outputExt = 'jpg';

  // Disable WebP option if browser doesn't support WebP export
  const testCanvas = document.createElement('canvas');
  if (!testCanvas.toDataURL('image/webp').startsWith('data:image/webp')) {
    const webpOpt = formatOptions.querySelector('[data-format="image/webp"]');
    if (webpOpt) {
      webpOpt.classList.add('unavailable');
      webpOpt.title = 'WebP export is not supported in this browser';
    }
  }

  function applyFormatUI() {
    formatOptions.querySelectorAll('.copy-option').forEach(el => {
      el.classList.toggle('active', el.dataset.format === outputFormat);
    });
    qualityRange.disabled = (outputFormat === 'image/png');
    const extLabel = outputExt.toUpperCase();
    downloadBtn.textContent = `⬇ Download passport photo (${extLabel})`;
    downloadSheetBtn.textContent = `🖨 Download KP-108IN print sheet (${extLabel})`;
  }

  const LS_KEY = 'gh-passport-photo-settings-v5';
  function saveSettings() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        borderMM: borderRange.value,
        gapMM: gapRange.value,
        quality: qualityRange.value,
        borderColor, bgColor,
        bgOn: bgToggle.checked,
        sheetCopies,
        outputFormat,
        outputExt,
      }));
    } catch (_) {}
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.borderMM != null) { borderRange.value = s.borderMM; borderVal.textContent = s.borderMM; }
      if (s.gapMM != null) { gapRange.value = s.gapMM; gapVal.textContent = s.gapMM; }
      if (s.quality != null) { qualityRange.value = s.quality; qualityVal.textContent = s.quality; }
      if (s.borderColor) {
        borderColor = s.borderColor;
        colorOptions.querySelectorAll('.color-option').forEach(el =>
          el.classList.toggle('active', el.dataset.color === borderColor));
      }
      if (s.bgColor) {
        bgColor = s.bgColor;
        bgColorOptions.querySelectorAll('.color-option').forEach(el =>
          el.classList.toggle('active', el.dataset.color === bgColor));
      }
      if (s.bgOn) { bgToggle.checked = true; bgPanel.style.display = 'block'; }
      if (s.sheetCopies) {
        sheetCopies = s.sheetCopies;
        copyOptions.querySelectorAll('.copy-option').forEach(el =>
          el.classList.toggle('active', parseInt(el.dataset.copies, 10) === sheetCopies));
      }
      if (s.outputFormat && s.outputExt) {
        const targetOpt = formatOptions.querySelector(`[data-format="${s.outputFormat}"]`);
        if (targetOpt && !targetOpt.classList.contains('unavailable')) {
          outputFormat = s.outputFormat;
          outputExt = s.outputExt;
        }
      }
    } catch (_) {}
    applyFormatUI();
  }
  loadSettings();

  formatOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.copy-option');
    if (!option || option.classList.contains('unavailable')) return;
    outputFormat = option.dataset.format;
    outputExt = option.dataset.ext;
    applyFormatUI();
    saveSettings();
  });

  async function loadFile(file) {
    if (!file) return;
    sourceFile = file;
    backgroundRemovedBitmap = null;
    removeBgBtn.disabled = false;
    removeBgBtn.textContent = '✂ Remove Background';
    bgStatus.textContent = 'Click the button to remove the background with AI. Your photo stays in this browser.';
    currentImageName = (file.name || 'photo').replace(/\.[^.]+$/, '');

    if (/\.hei[cf]$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif') {
      if (window.heic2any) {
        try {
          const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
          file = Array.isArray(converted) ? converted[0] : converted;
        } catch (err) {
          console.error(err);
          alert('Could not convert HEIC image.');
          return;
        }
      }
    }

    if (!file.type || !file.type.startsWith('image/')) return;
    // Keep the decoded file (including HEIC-to-JPEG conversion) for AI processing.
    sourceFile = file;
    const url = URL.createObjectURL(file);
    photo.onload = async () => {
      URL.revokeObjectURL(url);
      stage.style.display = 'inline-block';
      controls.style.display = 'block';
      try { photoBitmap = await createImageBitmap(file); }
      catch (_) { photoBitmap = null; }
      requestAnimationFrame(async () => {
        await initCropBoxWithFace();
        scheduleLivePreview(0);
      });
    };
    photo.src = url;
  }

  fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));
  fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.classList.add('dragover'); });
  fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
  fileDrop.addEventListener('drop', (e) => {
    e.preventDefault(); fileDrop.classList.remove('dragover');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { loadFile(f); break; } }
    }
  });

  async function detectFace() {
    detectedFace = null;
    autoBadge.style.display = 'none';
    if ('FaceDetector' in window && photoBitmap) {
      try {
        const fd = new window.FaceDetector({ fastMode: false, maxDetectedFaces: 1 });
        const faces = await fd.detect(photoBitmap);
        if (faces && faces.length) {
          const f = faces[0].boundingBox;
          const scaleX = photo.clientWidth / photoBitmap.width;
          const scaleY = photo.clientHeight / photoBitmap.height;
          detectedFace = { x: f.x * scaleX, y: f.y * scaleY, w: f.width * scaleX, h: f.height * scaleY };
          autoBadge.style.display = 'inline-flex';
          return detectedFace;
        }
      } catch (_) {}
    }
    return null;
  }

  async function initCropBoxWithFace() {
    const iw = photo.clientWidth, ih = photo.clientHeight;
    let h = ih * 0.6, w = h * ASPECT;
    if (w > iw * 0.8) { w = iw * 0.8; h = w / ASPECT; }
    let cx = iw / 2;
    let top = Math.max(0, (ih - h) * 0.35);

    const face = await detectFace();
    if (face) {
      const headH = face.h / 0.78;
      const targetHeadPct = 0.70;
      const newH = clamp(headH / targetHeadPct, ih * 0.5, ih * 0.92);
      const newW = newH * ASPECT;
      const eyeY = face.y + face.h * 0.42;
      let newTop = eyeY - newH * 0.55;
      cx = clamp(face.x + face.w / 2, newW / 2, iw - newW / 2);
      let newLeft = clamp(cx - newW / 2, 0, iw - newW);
      newTop = clamp(newTop, 0, ih - newH);
      box.x = newLeft; box.y = newTop; box.w = newW; box.h = newH;
    } else {
      box.w = w; box.h = h;
      box.x = (iw - w) / 2;
      box.y = top;
    }
    applyBox();
    updateCompliance();
  }

  function applyBox() {
    cropBox.style.left   = box.x + 'px';
    cropBox.style.top    = box.y + 'px';
    cropBox.style.width  = box.w + 'px';
    cropBox.style.height = box.h + 'px';
  }

  autoFitBtn.addEventListener('click', async () => {
    await initCropBoxWithFace();
    scheduleLivePreview(0);
  });

  let drag = null;
  cropBox.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cropBox.setPointerCapture(e.pointerId);
    const handle = e.target.classList.contains('handle') ? e.target.classList[1] : null;
    drag = { type: handle ? 'resize' : 'move', handle, startX: e.clientX, startY: e.clientY, box: { ...box } };
  });
  cropBox.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const iw = photo.clientWidth, ih = photo.clientHeight;
    const b = drag.box;
    if (drag.type === 'move') {
      box.x = clamp(b.x + dx, 0, iw - b.w);
      box.y = clamp(b.y + dy, 0, ih - b.h);
    } else {
      let newW = b.w, newH = b.h, newX = b.x, newY = b.y;
      if (drag.handle.includes('r')) newW = clamp(b.w + dx, 40, iw - b.x);
      if (drag.handle.includes('l')) { newW = clamp(b.w - dx, 40, b.x + b.w); newX = b.x + (b.w - newW); }
      newH = newW / ASPECT;
      if (newY + newH > ih) { newH = ih - newY; newW = newH * ASPECT; }
      if (drag.handle.includes('t')) { newH = clamp(newH, 40, b.y + b.h); newW = newH * ASPECT; newY = b.y + (b.h - newH); }
      box.x = clamp(newX, 0, iw - newW);
      box.y = clamp(newY, 0, ih - newH);
      box.w = newW; box.h = newH;
    }
    applyBox();
    updateCompliance();
    scheduleLivePreview();
  });
  cropBox.addEventListener('pointerup', () => { drag = null; });
  cropBox.addEventListener('pointercancel', () => { drag = null; });

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  borderRange.addEventListener('input', () => {
    borderVal.textContent = borderRange.value;
    saveSettings();
    scheduleLivePreview(50);
  });
  gapRange.addEventListener('input', () => {
    gapVal.textContent = gapRange.value;
    updateSheetHint();
    saveSettings();
  });
  qualityRange.addEventListener('input', () => { qualityVal.textContent = qualityRange.value; saveSettings(); });

  colorOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.color-option');
    if (!option) return;
    colorOptions.querySelectorAll('.color-option').forEach(el => el.classList.remove('active'));
    option.classList.add('active');
    borderColor = option.dataset.color;
    saveSettings();
    scheduleLivePreview(0);
  });

  bgToggle.addEventListener('change', () => {
    bgPanel.style.display = bgToggle.checked ? 'block' : 'none';
    saveSettings();
    scheduleLivePreview(0);
  });

  bgColorOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.color-option');
    if (!option) return;
    bgColorOptions.querySelectorAll('.color-option').forEach(el => el.classList.remove('active'));
    option.classList.add('active');
    bgColor = option.dataset.color;
    saveSettings();
    scheduleLivePreview(0);
  });

  copyOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.copy-option');
    if (!option || option.classList.contains('unavailable')) return;
    copyOptions.querySelectorAll('.copy-option').forEach(el => el.classList.remove('active'));
    option.classList.add('active');
    sheetCopies = parseInt(option.dataset.copies, 10);
    updateSheetHint();
    saveSettings();
  });

  function updateSheetHint() {
    const gapMM = parseFloat(gapRange.value);
    sheetHint.textContent = `Each photo is strictly 35 × 45 mm (413 × 531 px) with a ${gapMM} mm cut gap between copies.`;
  }
  updateSheetHint();

  function downsample(sourceCanvas, targetW, targetH) {
    let current = sourceCanvas;
    while (current.width / 2 >= targetW && current.height / 2 >= targetH) {
      const next = document.createElement('canvas');
      next.width  = Math.max(targetW, Math.floor(current.width / 2));
      next.height = Math.max(targetH, Math.floor(current.height / 2));
      const nctx = next.getContext('2d');
      nctx.imageSmoothingEnabled = true;
      nctx.imageSmoothingQuality = 'high';
      nctx.drawImage(current, 0, 0, next.width, next.height);
      current = next;
    }
    if (current.width === targetW && current.height === targetH) return current;
    const final = document.createElement('canvas');
    final.width = targetW;
    final.height = targetH;
    const fctx = final.getContext('2d');
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(current, 0, 0, targetW, targetH);
    return final;
  }

  function extractCrop(targetW, targetH) {
    const iw = photo.clientWidth, ih = photo.clientHeight;
    const scale = photo.naturalWidth / iw;
    const sx = box.x * scale, sy = box.y * scale, sw = box.w * scale, sh = box.h * scale;
    const source = (bgToggle.checked && backgroundRemovedBitmap) ? backgroundRemovedBitmap : (photoBitmap || photo);
    const naturalW = Math.max(1, Math.round(sw));
    const naturalH = Math.max(1, Math.round(sh));
    const tmp = document.createElement('canvas');
    tmp.width = naturalW; tmp.height = naturalH;
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(source, sx, sy, sw, sh, 0, 0, naturalW, naturalH);
    return downsample(tmp, targetW, targetH);
  }

  function renderPhoto() {
    const bigW = PHOTO_W_PX * SUPERSAMPLE;
    const bigH = PHOTO_H_PX * SUPERSAMPLE;
    const photoCanvas = extractCrop(bigW, bigH);

    // AI output has transparency. Add the selected solid background behind it.
    if (bgToggle.checked && backgroundRemovedBitmap) {
      const composite = document.createElement('canvas');
      composite.width = bigW;
      composite.height = bigH;
      const cctx = composite.getContext('2d');
      cctx.fillStyle = bgColor;
      cctx.fillRect(0, 0, bigW, bigH);
      cctx.drawImage(photoCanvas, 0, 0);
      return downsample(composite, PHOTO_W_PX, PHOTO_H_PX);
    }

    return downsample(photoCanvas, PHOTO_W_PX, PHOTO_H_PX);
  }

  // Strictly 35 × 45 mm (413 × 531 px) output; border is inset inside the 35×45 mm bounds
  function renderFinal(photoCanvas) {
    const borderMM = parseFloat(borderRange.value);
    const borderPx = Math.round(borderMM * MM_TO_PX);
    const innerW = Math.max(1, PHOTO_W_PX - borderPx * 2);
    const innerH = Math.max(1, PHOTO_H_PX - borderPx * 2);

    result.width = PHOTO_W_PX;
    result.height = PHOTO_H_PX;
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 0, PHOTO_W_PX, PHOTO_H_PX);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photoCanvas, 0, 0, PHOTO_W_PX, PHOTO_H_PX, borderPx, borderPx, innerW, innerH);

    resultInfo.textContent = `${PHOTO_W_PX} × ${PHOTO_H_PX} px (strict 35 × 45 mm) @ ${DPI} DPI · ${borderMM}mm inset border`;
  }

  let previewTimer = null;
  function scheduleLivePreview(delay = 150) {
    if (!photo.clientWidth) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      try {
        const photoCanvas = renderPhoto();
        renderFinal(photoCanvas);
        enableDownloads();
      } catch (err) { console.error(err); }
    }, delay);
  }

  function enableDownloads() {
    downloadBtn.classList.remove('disabled');
    downloadSheetBtn.classList.remove('disabled');
  }

  function updateCompliance() {
    if (!photo.clientHeight) return;
    let headPct = null, eyePct = null, centerPct = null;
    if (detectedFace) {
      const face = detectedFace;
      const headH = face.h / 0.78;
      headPct = headH / box.h;
      const eyeY = face.y + face.h * 0.42;
      eyePct = (eyeY - box.y) / box.h;
      const faceCx = face.x + face.w / 2;
      const cropCx = box.x + box.w / 2;
      centerPct = Math.abs(faceCx - cropCx) / box.w;
    }
    const setRow = (dotId, valId, value, fmt, ok, warn) => {
      const dot = document.getElementById(dotId);
      const el  = document.getElementById(valId);
      dot.className = 'dot ' + (value == null ? 'idle' : (ok(value) ? 'ok' : (warn(value) ? 'warn' : 'bad')));
      el.textContent = value == null ? '—' : fmt(value);
    };
    setRow('dotHead', 'valHead', headPct, v => `${(v*100).toFixed(0)}%`,
      v => v >= SPEC.headMinPct && v <= SPEC.headMaxPct,
      v => v >= SPEC.headMinPct - 0.05 && v <= SPEC.headMaxPct + 0.05);
    setRow('dotEyes', 'valEyes', eyePct, v => `${(v*100).toFixed(0)}%`,
      v => v >= SPEC.eyeMinPct && v <= SPEC.eyeMaxPct,
      v => v >= SPEC.eyeMinPct - 0.05 && v <= SPEC.eyeMaxPct + 0.05);
    setRow('dotCenter', 'valCenter', centerPct, v => `${(v*100).toFixed(1)}%`,
      v => v <= SPEC.centerTolPct,
      v => v <= SPEC.centerTolPct * 2);
  }

  removeBgBtn.addEventListener('click', async () => {
    if (!sourceFile || backgroundRemovedBitmap) return;

    removeBgBtn.disabled = true;
    removeBgBtn.innerHTML = '<span class="spinner"></span> Removing background…';
    bgStatus.textContent = 'Preparing the AI model. The first run may take longer because model files are downloaded.';

    try {
      const transparentPng = await removeBackground(sourceFile, {
        model: 'isnet_fp16',
        device: 'cpu',
        progress: (key, current, total) => {
          const percent = total ? Math.round((current / total) * 100) : 0;
          bgStatus.textContent = `Loading AI resources: ${percent}%`;
        }
      });

      backgroundRemovedBitmap = await createImageBitmap(transparentPng);
      bgStatus.textContent = 'Background removed. Choose white or red above, then render your passport photo.';
      removeBgBtn.textContent = '✓ Background Removed';
      scheduleLivePreview(0);
    } catch (err) {
      console.error('AI background removal failed:', err);
      bgStatus.textContent = 'Could not remove the background. Check your internet connection and try again.';
      removeBgBtn.disabled = false;
      removeBgBtn.textContent = '↻ Try Again';
      alert('Background removal failed: ' + (err?.message || 'Unknown error'));
    }
  });

  renderBtn.addEventListener('click', () => {
    renderBtn.disabled = true;
    const originalHTML = renderBtn.innerHTML;
    renderBtn.innerHTML = '<span class="spinner"></span> Rendering…';
    setTimeout(() => {
      try {
        const photoCanvas = renderPhoto();
        renderFinal(photoCanvas);
        enableDownloads();
      } catch (err) {
        console.error(err);
        alert('Render failed: ' + err.message);
      } finally {
        renderBtn.disabled = false;
        renderBtn.innerHTML = originalHTML;
      }
    }, 30);
  });

  function exportQuality() {
    if (outputFormat === 'image/png') return undefined;
    return Math.min(1, Math.max(0.5, parseInt(qualityRange.value, 10) / 100));
  }

  downloadBtn.addEventListener('click', (e) => {
    if (downloadBtn.classList.contains('disabled')) { e.preventDefault(); return; }
    downloadBtn.href = result.toDataURL(outputFormat, exportQuality());
    downloadBtn.download = `${currentImageName}-passport-35x45mm.${outputExt}`;
  });

  // KP-108IN print sheet (100 × 148 mm) with strictly 35 × 45 mm (413 × 531 px) per image
  downloadSheetBtn.addEventListener('click', (e) => {
    if (downloadSheetBtn.classList.contains('disabled')) { e.preventDefault(); return; }

    const gapMM = parseFloat(gapRange.value);
    const copies = sheetCopies; // 2 or 4
    const usedCols = 2;
    const usedRows = Math.ceil(copies / usedCols);

    const sheet = document.createElement('canvas');
    sheet.width = SHEET_W_PX;
    sheet.height = SHEET_H_PX;
    const sctx = sheet.getContext('2d');
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, SHEET_W_PX, SHEET_H_PX);

    // Block size = (cols * 35mm + (cols - 1) * gap) by (rows * 45mm + (rows - 1) * gap)
    const blockWMm = usedCols * PHOTO_W_MM + (usedCols - 1) * gapMM;
    const blockHMm = usedRows * PHOTO_H_MM + (usedRows - 1) * gapMM;
    const startXMm = (SHEET_W_MM - blockWMm) / 2;
    const startYMm = (SHEET_H_MM - blockHMm) / 2;

    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';

    let placed = 0;
    for (let r = 0; r < usedRows && placed < copies; r++) {
      for (let c = 0; c < usedCols && placed < copies; c++) {
        const xMm = startXMm + c * (PHOTO_W_MM + gapMM);
        const yMm = startYMm + r * (PHOTO_H_MM + gapMM);
        const xPx = Math.round(xMm * MM_TO_PX);
        const yPx = Math.round(yMm * MM_TO_PX);

        // Draw strictly 413 × 531 px (35 × 45 mm @ 300 DPI)
        sctx.drawImage(result, xPx, yPx, PHOTO_W_PX, PHOTO_H_PX);

        // Exact 35 × 45 mm cut-line border around each tile
        sctx.strokeStyle = 'rgba(0,0,0,0.22)';
        sctx.lineWidth = 1;
        sctx.strokeRect(xPx + 0.5, yPx + 0.5, PHOTO_W_PX - 1, PHOTO_H_PX - 1);
        placed++;
      }
    }

    downloadSheetBtn.href = sheet.toDataURL(outputFormat, exportQuality());
    downloadSheetBtn.download = `${currentImageName}-sheet-kp108in-${copies}up.${outputExt}`;
  });

  window.addEventListener('resize', () => {
    if (photo.clientWidth) { applyBox(); updateCompliance(); scheduleLivePreview(0); }
  });