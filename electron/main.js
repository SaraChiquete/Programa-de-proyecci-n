const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
const { initDb, getDb } = require('./database/db');
const proj = require('./windows/projection');

const appDataRoot = process.env.LOCALAPPDATA || app.getPath('home');
app.setPath('userData', path.join(appDataRoot, 'ProyectorIglesia'));

const TABLES = ['backgrounds','songs','song_slides','reflections','services','service_items','settings'];
const dbPath = () => path.join(app.getPath('userData'), 'proyector.db');

function seed() {
  const d = getDb();
  if (d.prepare('select count(*) c from backgrounds').get().c) return;
  const B = [
    ['Azul noche','gradient','linear-gradient(135deg,#1e3a8a,#0f172a)','biblia',1],
    ['Pergamino','gradient','linear-gradient(135deg,#f5e6c8,#d9b97a)','biblia',0],
    ['Negro','color','#000000','biblia',1],
    ['Amanecer','gradient','linear-gradient(135deg,#7c2d12,#f59e0b)','canciones',1],
    ['Violeta','gradient','linear-gradient(135deg,#4c1d95,#111827)','canciones',1],
    ['Océano','gradient','linear-gradient(135deg,#0e7490,#082f49)','canciones',1],
    ['Verde bosque','gradient','linear-gradient(135deg,#14532d,#052e16)','reflexiones',1],
    ['Blanco suave','color','#f8fafc','reflexiones',0],
    ['Gris carbón','color','#1f2937','anuncios',1],
    ['Rojo vino','gradient','linear-gradient(135deg,#7f1d1d,#1c1917)','anuncios',1],
    ['Celeste claro','gradient','linear-gradient(135deg,#e0f2fe,#7dd3fc)','presentaciones',0],
    ['Medianoche','color','#0b1020','presentaciones',1]];
  const s = d.prepare('insert into backgrounds(name,kind,value,category,is_dark) values(?,?,?,?,?)');
  B.forEach(b => s.run(...b));
}

function createControlWindow() {
  const win = new BrowserWindow({ width: 1450, height: 880, backgroundColor: '#0f1115', title: 'Programa de proyección Aliento de Vida',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('closed', () => { proj.closeProjection(); app.quit(); });
}

app.whenReady().then(() => {
  initDb(); seed();
  ipcMain.handle('projection:open', () => proj.openProjection());
  ipcMain.handle('projection:close', () => proj.closeProjection());
  ipcMain.on('projection:send', (_e, s) => proj.sendToProjection(s));
  ipcMain.handle('displays:get', () => { const d = proj.getDisplays(); return { count: d.count, hasExternal: !!d.external }; });
  ipcMain.handle('db:all', (_e, sql, p = []) => getDb().prepare(sql).all(...p));
  ipcMain.handle('db:run', (_e, sql, p = []) => Number(getDb().prepare(sql).run(...p).lastInsertRowid));

  ipcMain.handle('file:pickImage', (_e, cat) => {
    const f = dialog.showOpenDialogSync({ properties: ['openFile','multiSelections'], filters: [{ name: 'Imágenes', extensions: ['jpg','jpeg','png','webp'] }] });
    if (!f) return 0;
    const dir = path.join(app.getPath('userData'), 'backgrounds'); fs.mkdirSync(dir, { recursive: true });
    const ins = getDb().prepare("insert into backgrounds(name,kind,value,category,is_custom) values(?,'image',?,?,1)");
    f.forEach((src, i) => { const dest = path.join(dir, Date.now() + '_' + i + path.extname(src)); fs.copyFileSync(src, dest);
      ins.run(path.basename(src), `url("${pathToFileURL(dest).href}")`, cat || 'general'); });
    return f.length;
  });

  ipcMain.handle('bible:import', () => {
    const f = dialog.showOpenDialogSync({ filters: [{ name: 'Biblia JSON', extensions: ['json'] }] });
    if (!f) return null;
    const j = JSON.parse(fs.readFileSync(f[0], 'utf8')), d = getDb();
    d.transaction(() => {
      d.prepare('insert or ignore into bible_versions(code,name) values(?,?)').run(j.code, j.name || j.code);
      const vid = d.prepare('select id from bible_versions where code=?').get(j.code).id;
      const ib = d.prepare('insert or ignore into bible_books(number,name) values(?,?)'), gb = d.prepare('select id from bible_books where number=?');
      const iv = d.prepare('insert or replace into bible_verses values(?,?,?,?,?)');
      j.books.forEach((b, i) => { ib.run(i + 1, b.name); const bid = gb.get(i + 1).id;
        b.chapters.forEach((ch, ci) => ch.forEach((t, vi) => iv.run(vid, bid, ci + 1, vi + 1, t))); });
    })();
    return j.code;
  });

  ipcMain.handle('backup:create', async () => {
    const f = dialog.showSaveDialogSync({ defaultPath: 'respaldo-proyector.db' }); if (!f) return false;
    await getDb().backup(f); return true;
  });
  ipcMain.handle('backup:restore', () => {
    const f = dialog.showOpenDialogSync({ filters: [{ name: 'Respaldo', extensions: ['db'] }] }); if (!f) return false;
    getDb().close(); const p = dbPath();
    ['', '-wal', '-shm'].forEach(x => fs.rmSync(p + x, { force: true }));
    fs.copyFileSync(f[0], p); app.relaunch(); app.exit(); return true;
  });
  ipcMain.handle('data:export', () => {
    const f = dialog.showSaveDialogSync({ defaultPath: 'datos-proyector.json' }); if (!f) return false;
    const o = {}; TABLES.forEach(t => o[t] = getDb().prepare(`select * from ${t}`).all());
    fs.writeFileSync(f, JSON.stringify(o)); return true;
  });
  ipcMain.handle('data:import', () => {
    const f = dialog.showOpenDialogSync({ filters: [{ name: 'Datos', extensions: ['json'] }] }); if (!f) return false;
    const j = JSON.parse(fs.readFileSync(f[0], 'utf8')), d = getDb();
    d.transaction(() => { for (const t of TABLES) for (const r of j[t] || []) { const k = Object.keys(r);
      d.prepare(`insert or replace into ${t}(${k.join(',')}) values(${k.map(() => '?').join(',')})`).run(...Object.values(r)); } })();
    return true;
  });
  createControlWindow();
});
app.on('window-all-closed', () => app.quit());
