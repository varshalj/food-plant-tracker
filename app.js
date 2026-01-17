import { analyzeImage } from './ai.js';
import { saveRowsToNotion, fetchWeekEntries } from './notion.js';
import { getSetting, setSetting, clearAll } from './storage.js';
import { renderChips, getChipValues } from './ui.js';

// DOM Elements
const fileInput = document.getElementById('file-input');
const takePhotoBtn = document.getElementById('take-photo');
const preview = document.getElementById('preview');
const chipsDiv = document.getElementById('detected-chips');
const saveBtn = document.getElementById('save-entry');
const addManualBtn = document.getElementById('add-manual');

const settingsDlg = document.getElementById('settings');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const exportCsvBtn = document.getElementById('export-csv');
const resetLocalBtn = document.getElementById('reset-local');

const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const weekRange = document.getElementById('week-range');

const plantsList = document.getElementById('plants-list');
const refreshListBtn = document.getElementById('refresh-list');

let lastImageDataUrl = null;

// ============ Toast Notifications ============
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============ Loading State Helpers ============
function setButtonLoading(btn, loading) {
  const textEl = btn.querySelector('.btn-text');
  const loadingEl = btn.querySelector('.btn-loading');
  
  if (textEl && loadingEl) {
    textEl.hidden = loading;
    loadingEl.hidden = !loading;
  }
  btn.disabled = loading;
}

// ============ HEIC Conversion ============
async function convertHeicToJpeg(file) {
  if (!file.type.includes('heic') && !file.name.toLowerCase().endsWith('.heic') && !file.name.toLowerCase().endsWith('.heif')) {
    return file;
  }
  
  showToast('Converting iPhone photo...', 'info', 2000);
  
  try {
    // heic2any is loaded from CDN
    const blob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.85
    });
    
    // heic2any might return array for multi-image HEIC
    const resultBlob = Array.isArray(blob) ? blob[0] : blob;
    return new File([resultBlob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
  } catch (err) {
    console.error('HEIC conversion error:', err);
    throw new Error('Could not convert iPhone photo. Please try taking a screenshot instead.');
  }
}

// ============ File to DataURL ============
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ============ Initialize ============
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings
  document.getElementById('openai-model').value = getSetting('openaiModel') || 'gpt-4o-mini';
  document.getElementById('weekly-goal').value = getSetting('weeklyGoal') || 30;
  
  // Initial UI update
  await updateProgressUI();
  
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
});

// ============ Camera Flow ============
takePhotoBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (ev) => {
  let file = ev.target.files?.[0];
  if (!file) return;
  
  // Reset file input for back-to-back uploads
  fileInput.value = '';
  
  setButtonLoading(takePhotoBtn, true);
  chipsDiv.innerHTML = '';
  saveBtn.disabled = true;
  
  try {
    // Convert HEIC if needed
    file = await convertHeicToJpeg(file);
    
    // Show preview
    const dataUrl = await fileToDataUrl(file);
    lastImageDataUrl = dataUrl;
    preview.innerHTML = `<img src="${dataUrl}" alt="Food preview" />`;
    chipsDiv.innerHTML = `<div class="chip processing">🔍 Analyzing image...</div>`;
    
    // Analyze with AI
    const openaiKey = getSetting('openaiKey') || document.getElementById('openai-key').value;
    if (!openaiKey) {
      throw new Error('Please add your OpenAI API key in Settings');
    }
    
    const model = getSetting('openaiModel') || document.getElementById('openai-model').value || 'gpt-4o-mini';
    const result = await analyzeImage(dataUrl, model, openaiKey);
    const plants = result?.plants || [];
    
    if (plants.length === 0) {
      chipsDiv.innerHTML = `<div class="chip">No plants detected — add manually</div>`;
      showToast('No plants detected in image', 'warning');
    } else {
      renderChips(chipsDiv, plants);
      showToast(`Found ${plants.length} plant${plants.length > 1 ? 's' : ''}!`, 'success');
    }
    
    saveBtn.disabled = false;
    
  } catch (err) {
    console.error('Analysis error:', err);
    preview.innerHTML = '';
    chipsDiv.innerHTML = '';
    lastImageDataUrl = null;
    showToast(err.message || 'Failed to analyze image', 'error');
  } finally {
    setButtonLoading(takePhotoBtn, false);
  }
});

// ============ Manual Add ============
addManualBtn.addEventListener('click', () => {
  const currentValues = getChipValues(chipsDiv);
  renderChips(chipsDiv, [...currentValues, '']);
  saveBtn.disabled = false;
  
  // Focus the new input
  setTimeout(() => {
    const inputs = chipsDiv.querySelectorAll('input');
    inputs[inputs.length - 1]?.focus();
  }, 50);
});

// ============ Save Entry ============
saveBtn.addEventListener('click', async () => {
  const plants = getChipValues(chipsDiv)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  
  const uniquePlants = [...new Set(plants)];
  
  if (uniquePlants.length === 0) {
    showToast('Add at least one plant', 'warning');
    return;
  }
  
  const notionToken = getSetting('notionToken') || document.getElementById('notion-token').value;
  const notionDb = getSetting('notionDb') || document.getElementById('notion-db').value;
  
  if (!notionToken || !notionDb) {
    showToast('Please set Notion credentials in Settings', 'error');
    return;
  }
  
  setButtonLoading(saveBtn, true);
  
  try {
    const now = new Date().toISOString();
    const rows = uniquePlants.map(p => ({
      date: now,
      canonical: p,
      original: p,
      source: lastImageDataUrl ? 'photo' : 'manual',
    }));
    
    await saveRowsToNotion(rows, notionToken, notionDb);
    
    showToast(`Saved ${uniquePlants.length} plant${uniquePlants.length > 1 ? 's' : ''}! 🌱`, 'success');
    
    // Clear UI
    preview.innerHTML = '';
    chipsDiv.innerHTML = '';
    lastImageDataUrl = null;
    saveBtn.disabled = true;
    
    // Refresh progress and list
    await updateProgressUI();
    
  } catch (err) {
    console.error('Save error:', err);
    showToast(err.message || 'Failed to save to Notion', 'error');
  } finally {
    setButtonLoading(saveBtn, false);
  }
});

// ============ Settings ============
openSettingsBtn.addEventListener('click', () => {
  document.getElementById('openai-key').value = getSetting('openaiKey') || '';
  document.getElementById('notion-token').value = getSetting('notionToken') || '';
  document.getElementById('notion-db').value = getSetting('notionDb') || '';
  document.getElementById('openai-model').value = getSetting('openaiModel') || 'gpt-4o-mini';
  document.getElementById('weekly-goal').value = getSetting('weeklyGoal') || 30;
  settingsDlg.showModal();
});

closeSettingsBtn.addEventListener('click', () => {
  setSetting('openaiKey', document.getElementById('openai-key').value.trim());
  setSetting('notionToken', document.getElementById('notion-token').value.trim());
  setSetting('notionDb', document.getElementById('notion-db').value.trim());
  setSetting('openaiModel', document.getElementById('openai-model').value.trim());
  setSetting('weeklyGoal', Number(document.getElementById('weekly-goal').value) || 30);
  settingsDlg.close();
  showToast('Settings saved!', 'success');
  updateProgressUI();
});

// ============ Export CSV ============
exportCsvBtn.addEventListener('click', async () => {
  const notionToken = getSetting('notionToken') || document.getElementById('notion-token').value;
  const notionDb = getSetting('notionDb') || document.getElementById('notion-db').value;
  
  if (!notionToken || !notionDb) {
    showToast('Please set Notion credentials first', 'error');
    return;
  }
  
  try {
    showToast('Preparing export...', 'info');
    const all = await fetchWeekEntries(notionToken, notionDb, { all: true });
    
    if (!all.length) {
      showToast('No entries to export', 'warning');
      return;
    }
    
    const csv = jsonToCsv(all);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planttrack-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Export downloaded!', 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast('Export failed', 'error');
  }
});

// ============ Reset Local ============
resetLocalBtn.addEventListener('click', () => {
  if (!confirm('Clear all local settings and API keys?')) return;
  clearAll();
  settingsDlg.close();
  showToast('Local data cleared', 'info');
  updateProgressUI();
});

// ============ Refresh Plants List ============
refreshListBtn.addEventListener('click', () => {
  updateProgressUI();
  showToast('Refreshed!', 'success', 1500);
});

// ============ Update Progress UI & Plants List ============
async function updateProgressUI() {
  try {
    const notionToken = getSetting('notionToken');
    const notionDb = getSetting('notionDb');
    const weeklyGoal = Number(getSetting('weeklyGoal') || 30);
    
    progressBar.max = weeklyGoal;
    
    if (!notionToken || !notionDb) {
      progressText.innerText = `0 / ${weeklyGoal}`;
      progressBar.value = 0;
      weekRange.innerText = '';
      plantsList.innerHTML = `<div class="plants-empty">Set up Notion in Settings to start tracking</div>`;
      return;
    }
    
    const entries = await fetchWeekEntries(notionToken, notionDb);
    const uniquePlants = [...new Set(entries.map(r => r.canonical).filter(Boolean))];
    
    // Update progress
    progressText.innerText = `${uniquePlants.length} / ${weeklyGoal}`;
    progressBar.value = uniquePlants.length;
    
    // Update week range
    const now = new Date();
    const start = startOfISOWeek(now);
    const end = endOfISOWeek(now);
    weekRange.innerText = `${start.toLocaleDateString()} — ${end.toLocaleDateString()}`;
    
    // Update plants list
    if (uniquePlants.length === 0) {
      plantsList.innerHTML = `<div class="plants-empty">No plants logged yet this week</div>`;
    } else {
      plantsList.innerHTML = uniquePlants
        .sort()
        .map(p => `<span class="plant-tag">${p}</span>`)
        .join('');
    }
    
    // Celebrate if goal reached!
    if (uniquePlants.length >= weeklyGoal && uniquePlants.length > 0) {
      const celebrated = getSetting('celebratedThisWeek');
      const weekKey = start.toISOString().split('T')[0];
      if (celebrated !== weekKey) {
        showToast('🎉 Weekly goal reached! Amazing!', 'success', 5000);
        setSetting('celebratedThisWeek', weekKey);
      }
    }
    
  } catch (e) {
    console.error('Progress update error:', e);
  }
}

// ============ Helpers ============
function startOfISOWeek(d) {
  const date = new Date(d);
  const day = date.getDay() || 7;
  if (day !== 1) date.setHours(-24 * (day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfISOWeek(d) {
  const s = startOfISOWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}

function jsonToCsv(arr) {
  if (!arr?.length) return '';
  const keys = Object.keys(arr[0]);
  const rows = [
    keys.join(','),
    ...arr.map(r => keys.map(k => `"${String(r[k] || '').replace(/"/g, '""')}"`).join(','))
  ];
  return rows.join('\n');
}
