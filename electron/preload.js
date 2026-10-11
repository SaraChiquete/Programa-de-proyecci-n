const { contextBridge, ipcRenderer: r } = require('electron');
const inv = (c) => (...a) => r.invoke(c, ...a);
contextBridge.exposeInMainWorld('api', {
  openProjection: inv('projection:open'), closeProjection: inv('projection:close'),
  project: (s) => r.send('projection:send', s), getDisplays: inv('displays:get'),
  onState: (cb) => r.on('projection:state', (_e, s) => cb(s)),
  all: inv('db:all'), run: inv('db:run'), pickImage: inv('file:pickImage'),
  importBible: inv('bible:import'), backup: inv('backup:create'), restore: inv('backup:restore'),
  exportData: inv('data:export'), importData: inv('data:import')
});
