const { BrowserWindow, screen } = require('electron');
const path = require('path');

let win = null;
let lastState = { mode: 'black' };

function getDisplays() {
  const primary = screen.getPrimaryDisplay();
  const all = screen.getAllDisplays();
  const external = all.find(d => d.isInternal === false)
    || all.find(d => d.id !== primary.id && (d.bounds.x !== primary.bounds.x || d.bounds.y !== primary.bounds.y || d.bounds.width !== primary.bounds.width || d.bounds.height !== primary.bounds.height))
    || all.find(d => d.id !== primary.id)
    || null;
  return { primary, external, count: all.length };
}

function openProjection() {
  if (win && !win.isDestroyed()) return { testMode: !getDisplays().external };
  const { external } = getDisplays();
  const target = external || screen.getPrimaryDisplay();
  const opts = {
    backgroundColor: '#000000', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '../preload.js'), contextIsolation: true }
  };
  if (external) {
    Object.assign(opts, { x: external.bounds.x, y: external.bounds.y,
      width: external.bounds.width, height: external.bounds.height, frame: false, fullscreen: true, show: false });
  } else if (screen.getAllDisplays().length > 0) {
    Object.assign(opts, { x: target.bounds.x, y: target.bounds.y,
      width: target.bounds.width, height: target.bounds.height, frame: false, fullscreen: true, show: false });
  } else {
    Object.assign(opts, { width: 960, height: 540, title: 'Proyección (modo prueba)' });
  }
  win = new BrowserWindow(opts);
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../../projection/projection.html'));
  win.webContents.on('did-finish-load', () => win.webContents.send('projection:state', lastState));
  win.on('closed', () => { win = null; });
  if (external || screen.getAllDisplays().length > 0) {
    win.show();
    win.focus();
  }
  return { testMode: !external && screen.getAllDisplays().length <= 1 };
}

function closeProjection() { if (win && !win.isDestroyed()) win.close(); }

function sendToProjection(state) {
  lastState = state;
  if (win && !win.isDestroyed()) win.webContents.send('projection:state', state);
}

module.exports = { openProjection, closeProjection, sendToProjection, getDisplays };
