// Persistência local. No executável (Electron) grava arquivos JSON em %APPDATA%/Mina Engrenada/saves.
// No navegador (modo desenvolvimento) usa localStorage como alternativa.
const api = typeof window !== 'undefined' ? window.gameAPI : null;

export const SLOTS = [
  { id: 'auto', name: 'Salvamento automático' },
  { id: 'slot1', name: 'Espaço 1' },
  { id: 'slot2', name: 'Espaço 2' },
  { id: 'slot3', name: 'Espaço 3' },
];

export async function writeSave(slot, data) {
  const text = JSON.stringify(data);
  if (api) return api.writeSave(slot, text);
  try { localStorage.setItem('me_save_' + slot, text); return { ok: true }; }
  catch (e) { return { ok: false, error: 'o navegador bloqueou o armazenamento local' }; }
}

// retorna { data } ou { error } ; tenta o backup se o principal estiver corrompido
export async function readSave(slot) {
  let raw = null, backup = null;
  if (api) { const r = await api.readSave(slot); raw = r.text; backup = r.backup; }
  else { try { raw = localStorage.getItem('me_save_' + slot); } catch { raw = null; } }
  if (!raw) return { error: 'Nenhum salvamento neste espaço' };
  try { return { data: JSON.parse(raw) }; }
  catch (e) {
    if (backup) { try { return { data: JSON.parse(backup), recovered: true }; } catch {} }
    return { error: 'Arquivo de salvamento corrompido (JSON inválido)' };
  }
}

export async function listSaves() {
  const out = {};
  for (const s of SLOTS) {
    if (api) { const m = await api.saveInfo(s.id); if (m) out[s.id] = m; }
    else {
      let raw = null; try { raw = localStorage.getItem('me_save_' + s.id); } catch {}
      if (raw) { try { const d = JSON.parse(raw); out[s.id] = { savedAt: d.savedAt, money: d.economy?.money, time: d.time }; } catch { out[s.id] = { corrupt: true }; } }
    }
  }
  return out;
}

export async function loadSettings(defaults) {
  try {
    const raw = api ? await api.readSettings() : localStorage.getItem('me_settings');
    return { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...defaults }; }
}
export async function saveSettings(s) {
  const t = JSON.stringify(s);
  if (api) return api.writeSettings(t);
  try { localStorage.setItem('me_settings', t); } catch {}
}
export function quitApp() { if (api) api.quit(); else window.close(); }
export function setFullscreen(on) { if (api) api.setFullscreen(on); }
export const isDesktop = !!api;
