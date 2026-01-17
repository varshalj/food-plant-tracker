import { analyzeImage } from './ai.js';
import { saveRowsToNotion, fetchWeekEntries } from './notion.js';
import { getSetting, setSetting, clearAll } from './storage.js';
import { renderChips, getChipValues } from './ui.js';

const fileInput = document.getElementById('file-input');
const takePhoto = document.getElementById('take-photo');
const preview = document.getElementById('preview');
const chipsDiv = document.getElementById('detected-chips');
const saveBtn = document.getElementById('save-entry');
const addManual = document.getElementById('add-manual');

const settingsDlg = document.getElementById('settings');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const exportCsvBtn = document.getElementById('export-csv');
const resetLocalBtn = document.getElementById('reset-local');

const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const weekRange = document.getElementById('week-range');

let lastImageDataUrl = null;

// Setup
document.addEventListener('DOMContentLoaded', async () => {
  // load saved model default
  document.getElementById('openai-model').value = getSetting('openaiModel') || 'gpt-4o-mini';
  document.getElementById('weekly-goal').value = getSetting('weeklyGoal') || 30;
  updateProgressUI();
  // service worker register
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  }
});

// Camera flow
takePhoto.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  lastImageDataUrl = dataUrl;
  preview.innerHTML = `<img src="${dataUrl}" alt="preview" />`;
  chipsDiv.innerHTML = `<div class="chip">Processing…</div>`;
  saveBtn.disabled = true;
  try {
    const model = document.getElementById('openai-model').value;
    const openaiKey = getSetting('openaiKey') || document.getElementById('openai-key').value;
    const result = await analyzeImage(dataUrl, model, openaiKey);
    const plants = result?.plants || [];
    renderChips(chipsDiv, plants);
    saveBtn.disabled = plants.length===0;
  } catch (err) {
    console.error(err);
    chipsDiv.innerHTML = `<div class="chip">Couldn't detect — please edit manually</div>`;
    saveBtn.disabled = false;
  }
});

addManual.addEventListener('click', () => {
  renderChips(chipsDiv, [...getChipValues(chipsDiv), '']);
});

saveBtn.addEventListener('click', async () => {
  const canonicalPlants = dedupeArray(getChipValues(chipsDiv).map(s => s.trim().toLowerCase()).filter(Boolean));
  if (canonicalPlants.length === 0) return alert('Add at least one plant');
  const openaiKey = getSetting('openaiKey') || document.getElementById('openai-key').value;
  const notionToken = getSetting('notionToken') || document.getElementById('notion-token').value;
  const notionDb = getSetting('notionDb') || document.getElementById('notion-db').value;
  if (!openaiKey || !notionToken || !notionDb) return alert('Please set keys in Settings');

  // build rows
  const now = new Date().toISOString();
  const rows = canonicalPlants.map(p => ({
    date: now,
    canonical: p,
    original: p,
    source: lastImageDataUrl ? 'photo' : 'manual',
  }));
  await saveRowsToNotion(rows, notionToken, notionDb);
  // update progress
  updateProgressUI();
  // clear preview
  preview.innerHTML = '';
  chipsDiv.innerHTML = '';
  lastImageDataUrl = null;
  saveBtn.disabled = true;
});

openSettingsBtn.addEventListener('click', () => {
  // populate fields from storage
  document.getElementById('openai-key').value = getSetting('openaiKey') || '';
  document.getElementById('notion-token').value = getSetting('notionToken') || '';
  document.getElementById('notion-db').value = getSetting('notionDb') || '';
  document.getElementById('openai-model').value = getSetting('openaiModel') || 'gpt-4o-mini';
  document.getElementById('weekly-goal').value = getSetting('weeklyGoal') || 30;
  settingsDlg.showModal();
});

closeSettingsBtn.addEventListener('click', () => {
  // save settings
  setSetting('openaiKey', document.getElementById('openai-key').value.trim());
  setSetting('notionToken', document.getElementById('notion-token').value.trim());
  setSetting('notionDb', document.getElementById('notion-db').value.trim());
  setSetting('openaiModel', document.getElementById('openai-model').value.trim());
  setSetting('weeklyGoal', Number(document.getElementById('weekly-goal').value) || 30);
  settingsDlg.close();
  updateProgressUI();
});

// export/reset
exportCsvBtn.addEventListener('click', async () => {
  const notionToken = getSetting('notionToken') || document.getElementById('notion-token').value;
  const notionDb = getSetting('notionDb') || document.getElementById('notion-db').value;
  if (!notionToken || !notionDb) return alert("Please set Notion keys");
  // fetch all week entries and download CSV
  const all = await fetchWeekEntries(notionToken, notionDb, {all:true});
  const csv = jsonToCsv(all);
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'planttrack-export.csv'; a.click();
  URL.revokeObjectURL(url);
});

resetLocalBtn.addEventListener('click', () => {
  if (!confirm('Clear local settings?')) return;
  clearAll();
  settingsDlg.close();
  updateProgressUI();
});

// helpers
function fileToDataUrl(file){ return new Promise(resolve => {
  const r = new FileReader(); r.onload = e => resolve(e.target.result); r.readAsDataURL(file);
});}
function dedupeArray(arr){ return [...new Set(arr)]; }

async function updateProgressUI(){
  try{
    const notionToken = getSetting('notionToken') || document.getElementById('notion-token').value;
    const notionDb = getSetting('notionDb') || document.getElementById('notion-db').value;
    const weeklyGoal = Number(getSetting('weeklyGoal') || document.getElementById('weekly-goal')?.value || 30);
    if (!notionToken || !notionDb) {
      progressText.innerText = `0 / ${weeklyGoal}`;
      progressBar.max = weeklyGoal; progressBar.value = 0;
      return;
    }
    const entries = await fetchWeekEntries(notionToken, notionDb);
    // dedupe by canonical plant
    const uniquePlants = [...new Set(entries.map(r => r.canonical))];
    progressText.innerText = `${uniquePlants.length} / ${weeklyGoal}`;
    progressBar.max = weeklyGoal;
    progressBar.value = uniquePlants.length;
    const now = new Date();
    const start = startOfISOWeek(now); const end = endOfISOWeek(now);
    weekRange.innerText = `${start.toLocaleDateString()} — ${end.toLocaleDateString()}`;
  }catch(e){ console.error(e); }
}

function startOfISOWeek(d){
  const date = new Date(d); const day = date.getDay() || 7;
  if(day !== 1) date.setHours(-24*(day-1));
  date.setHours(0,0,0,0);
  return date;
}
function endOfISOWeek(d){
  const s = startOfISOWeek(d); const e = new Date(s); e.setDate(s.getDate()+6); return e;
}
function jsonToCsv(arr){
  if(!arr || !arr.length) return '';
  const keys = Object.keys(arr[0]);
  const rows = [keys.join(','), ...arr.map(r => keys.map(k => `"${String(r[k]||'').replace(/"/g,'""')}"`).join(','))];
  return rows.join('\n');
}
