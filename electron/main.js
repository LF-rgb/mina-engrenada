// Processo principal do Electron: janela do jogo e acesso ao sistema de arquivos para salvamentos.
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Mina Engrenada');
if (process.env.ME_USERDATA) app.setPath('userData', process.env.ME_USERDATA); // usado pelos testes
const userDir = () => app.getPath('userData'); // Windows: %APPDATA%\Mina Engrenada
const saveDir = () => { const d = path.join(userDir(), 'saves'); fs.mkdirSync(d, { recursive: true }); return d; };
const safeSlot = (s) => String(s).replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'slot';

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.bak'); } catch {} }
  fs.renameSync(tmp, file);
}

ipcMain.handle('save:write', (e, slot, text) => {
  try { writeAtomic(path.join(saveDir(), safeSlot(slot) + '.json'), text); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('save:read', (e, slot) => {
  const f = path.join(saveDir(), safeSlot(slot) + '.json');
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  return { text: read(f), backup: read(f + '.bak') };
});
ipcMain.handle('save:info', (e, slot) => {
  const f = path.join(saveDir(), safeSlot(slot) + '.json');
  if (!fs.existsSync(f)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { savedAt: d.savedAt, money: d.economy && d.economy.money, time: d.time };
  } catch { return { corrupt: true }; }
});
ipcMain.handle('settings:read', () => { try { return fs.readFileSync(path.join(userDir(), 'settings.json'), 'utf8'); } catch { return null; } });
ipcMain.handle('settings:write', (e, text) => { try { writeAtomic(path.join(userDir(), 'settings.json'), text); return true; } catch { return false; } });
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on); });

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1920, height: 1080, minWidth: 1024, minHeight: 640,
    backgroundColor: '#0e1422', title: 'Mina Engrenada', show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  const small = process.env.ME_WINDOW; // ex.: 1280x720 (testes)
  if (small) { const [w, h] = small.split('x').map(Number); win.setSize(w, h); }
  win.once('ready-to-show', () => { if (!small) win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (process.env.ME_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
