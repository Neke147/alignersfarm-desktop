// AlignersFarm për Windows: një dritare që hap portalin + përditësim automatik i vetë programit.
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const PORTAL = 'https://portal.alignerfarm.com';
const inPortal = (u) => { try { return new URL(u).origin === PORTAL; } catch { return false; } };
const isFile = (u) => { try { return /\.supabase\.co$/.test(new URL(u).hostname); } catch { return false; } };

// emri i aplikacionit për njoftimet e Windows (përditësimet e portalit dalin si njoftim i sistemit)
if (process.platform === 'win32') app.setAppUserModelId('com.alignerfarm.portal');

let win = null;
let manual = false;          // kontroll i nisur nga përdoruesi (tregon edhe «s'ka përditësim»)
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

/* ---------- përditësimet ---------- */
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-available', (i) => {
  if (manual) dialog.showMessageBox(win, { type: 'info', title: 'AlignersFarm', message: `A new version (${i.version}) is available.`, detail: 'It is downloading now – we will tell you when it is ready.' });
});
autoUpdater.on('update-not-available', () => {
  if (manual) dialog.showMessageBox(win, { type: 'info', title: 'AlignersFarm', message: 'You have the latest version.', detail: `Version ${app.getVersion()}` });
  manual = false;
});
autoUpdater.on('error', (e) => {
  if (manual) dialog.showMessageBox(win, { type: 'warning', title: 'AlignersFarm', message: 'Could not check for updates.', detail: String((e && e.message) || e) });
  manual = false;
});
autoUpdater.on('download-progress', (p) => { if (win) win.setProgressBar(p.percent / 100); });
autoUpdater.on('update-downloaded', async (i) => {
  manual = false;
  if (win) win.setProgressBar(-1);
  const r = await dialog.showMessageBox(win, {
    type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, title: 'AlignersFarm',
    message: `Version ${i.version} is ready.`, detail: 'Restart the app to use the new version. If you choose «Later», it installs when you close the app.',
  });
  if (r.response === 0) autoUpdater.quitAndInstall();
});
const checkUpdates = (byUser) => {
  if (!app.isPackaged) return;
  manual = !!byUser;
  autoUpdater.checkForUpdates().catch(() => {});
};

/* ---------- menuja ---------- */
function menu() {
  return Menu.buildFromTemplate([
    { label: 'AlignersFarm', submenu: [
      { label: 'Check for updates…', click: () => checkUpdates(true) },
      { label: `Version ${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: 'Open in the browser', click: () => shell.openExternal(win ? win.webContents.getURL() : PORTAL) },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Ctrl+Q', role: 'quit' },
    ] },
    { label: 'View', submenu: [
      { label: 'Back', accelerator: 'Alt+Left', click: () => win && win.webContents.canGoBack() && win.webContents.goBack() },
      { label: 'Reload', accelerator: 'F5', click: () => win && win.webContents.reload() },
      { type: 'separator' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { role: 'togglefullscreen' },
    ] },
    { label: 'Help', submenu: [
      { label: 'Get help', click: () => win && win.loadURL(PORTAL + '/more/help') },
      { label: 'Developer tools', accelerator: 'Ctrl+Shift+I', click: () => win && win.webContents.toggleDevTools() },
    ] },
  ]);
}

function create() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 980, minHeight: 640,
    title: 'AlignersFarm', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#EEF4F2', show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(menu());
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL(PORTAL);

  // lidhjet: portali në të njëjtën dritare, skedarët shkarkohen, faqet e tjera hapen në shfletues
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (inPortal(url)) { win.loadURL(url); return { action: 'deny' }; }
    if (isFile(url)) { win.webContents.downloadURL(url); return { action: 'deny' }; }
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (inPortal(url)) return;
    e.preventDefault();
    if (isFile(url)) win.webContents.downloadURL(url); else shell.openExternal(url);
  });

  // kontrollon për version të ri 10 sekonda pas nisjes dhe çdo 4 orë
  setTimeout(() => checkUpdates(false), 10_000);
  setInterval(() => checkUpdates(false), 4 * 60 * 60 * 1000);
}

app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
