const { app } = require('electron');
const Database = require('better-sqlite3');

app.whenReady().then(() => {
  console.log('[TEST] App ready in Electron process', process.pid);
  const dbPath = '/tmp/rt-library-electron-test.sqlite';
  const db = new Database(dbPath);
  const version = db.prepare('SELECT sqlite_version()').pluck().get();
  console.log('✅ SQLite Version inside Electron:', version);
  db.close();
  app.quit();
});
