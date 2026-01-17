export function setSetting(k,v){ localStorage.setItem('pt_' + k, typeof v === 'object' ? JSON.stringify(v) : String(v)); }
export function getSetting(k){ const v = localStorage.getItem('pt_' + k); try { return JSON.parse(v); } catch(e) { return v; } }
export function clearAll(){ Object.keys(localStorage).filter(k => k.startsWith('pt_')).forEach(k => localStorage.removeItem(k)); }
