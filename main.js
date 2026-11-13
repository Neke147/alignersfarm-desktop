// AlignersFarm për Windows: një dritare që hap portalin + përditësim automatik i vetë programit.
const { app, BrowserWindow, shell, Menu, dialog, ipcMain, screen } = require('electron');
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
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  Menu.setApplicationMenu(menu());
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('focus', () => win.flashFrame(false));
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

/* ---------- njoftimet në desktop: kartë që rrëshqet nga djathtas, poshtë ---------- */
const toasts = [];               // kartat e hapura (më e reja poshtë)
const TW = 380, TH = 112, GAP = 10, MARGIN = 16;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function layoutToasts() {
  const wa = screen.getPrimaryDisplay().workArea;
  toasts.forEach((t, i) => {
    t.y = wa.y + wa.height - MARGIN - (i + 1) * TH - i * GAP;
    if (!t.win.isDestroyed()) t.win.setPosition(Math.round(t.x), Math.round(t.y));
  });
}
function slide(t, from, to, ms, done) {
  const start = Date.now();
  const tick = () => {
    if (t.win.isDestroyed()) return;
    const p = Math.min(1, (Date.now() - start) / ms), e = 1 - Math.pow(1 - p, 3);
    t.x = from + (to - from) * e;
    t.win.setPosition(Math.round(t.x), Math.round(t.y));
    if (p < 1) setTimeout(tick, 12); else if (done) done();
  };
  tick();
}
function closeToast(t) {
  if (t.closing) return; t.closing = true;
  const wa = screen.getPrimaryDisplay().workArea;
  slide(t, t.x, wa.x + wa.width + 10, 220, () => {
    if (!t.win.isDestroyed()) t.win.destroy();
    toasts.splice(toasts.indexOf(t), 1); layoutToasts();
  });
}
function showToast(n) {
  if (toasts.length >= 4) closeToast(toasts[toasts.length - 1]);
  const wa = screen.getPrimaryDisplay().workArea;
  const tw = new BrowserWindow({
    width: TW, height: TH, frame: false, transparent: true, resizable: false, movable: false, alwaysOnTop: true,
    skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    webPreferences: { contextIsolation: true, sandbox: true, javascript: true },
  });
  tw.setAlwaysOnTop(true, 'screen-saver');
  const t = { win: tw, x: wa.x + wa.width + 10, y: 0, n };
  toasts.unshift(t); layoutToasts();
  const icon = n.kind === 'case_message' ? '💬' : n.kind === 'update' ? '⬆️' : '🔔';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent;font-family:'Segoe UI',Arial,sans-serif;overflow:hidden}
    .c{margin:6px;height:${TH - 12}px;box-sizing:border-box;background:#fff;border-radius:14px;border-left:5px solid #1B6B62;
       box-shadow:0 6px 22px rgba(0,0,0,.25);display:flex;gap:12px;padding:12px 30px 12px 14px;cursor:pointer;align-items:flex-start}
    .i{width:38px;height:38px;border-radius:19px;background:#1B6B62;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none}
    .t{font-weight:700;color:#173B37;font-size:14px;line-height:1.3;max-height:36px;overflow:hidden}
    .b{color:#5f6b69;font-size:12.5px;margin-top:3px;line-height:1.35;max-height:34px;overflow:hidden}
    .a{font-size:11px;color:#1B6B62;font-weight:700;margin-top:4px;letter-spacing:.3px}
    .x{position:absolute;right:16px;top:12px;color:#999;font-size:16px;text-decoration:none}
  </style></head><body>
    <div class="c" onclick="location.href='af-open:'"><div class="i">${icon}</div>
    <div style="flex:1;min-width:0"><div class="t">${esc(n.title || 'AlignersFarm')}</div>${n.body ? `<div class="b">${esc(n.body)}</div>` : ''}<div class="a">ALIGNERSFARM · Click to open</div></div></div>
    <a class="x" href="af-close:" onclick="event.stopPropagation()">✕</a>
  </body></html>`;
  tw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  // kliku: hap portalin te faqja e njoftimit; ✕ e mbyll
  tw.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (url.startsWith('af-open:') && win) {
      if (win.isMinimized()) win.restore();
      win.show(); win.focus();
      if (n.kind === 'update') win.webContents.reload();
      else if (n.to) win.loadURL(PORTAL + n.to);
    }
    closeToast(t);
  });
  tw.once('ready-to-show', () => {
    tw.showInactive();
    slide(t, wa.x + wa.width + 10, wa.x + wa.width - TW - MARGIN + 6, 320);
  });
  t.timer = setTimeout(() => closeToast(t), n.kind === 'update' ? 15000 : 8000);
}

// portali kërkon njoftim (vetëm nga faqet e portalit); kur dritarja nuk është para, edhe ikona në shirit pulson
ipcMain.on('af-notify', (e, n) => {
  if (!inPortal(e.senderFrame ? e.senderFrame.url : e.sender.getURL())) return;
  if (!n || (!n.title && !n.body)) return;
  const away = !win || !win.isFocused() || win.isMinimized();
  if (away || n.kind === 'update') showToast(n);    // kur jeni në portal, njoftimi del brenda faqes
  if (win && away) win.flashFrame(true);
});

app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
