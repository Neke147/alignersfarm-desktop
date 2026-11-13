// Ura e sigurt mes portalit dhe programit të Windows: portali kërkon njoftime në desktop.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('afDesktop', {
  notify: (n) => ipcRenderer.send('af-notify', {
    title: String(n?.title ?? '').slice(0, 140), body: String(n?.body ?? '').slice(0, 300),
    to: typeof n?.to === 'string' ? n.to.slice(0, 200) : null, kind: String(n?.kind ?? ''),
  }),
});
