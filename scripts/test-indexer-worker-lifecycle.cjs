const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { WORKER_MESSAGE_TYPES: types } = require('../electron/indexer/workerProtocol.cjs');
const workers = [];
class Worker extends EventEmitter {
  postMessage(task) { this.task = task; }
  kill() { this.killed = true; }
  complete() {
    this.emit('message', { type: types.COMPLETE, taskId: this.task.taskId, categoryId: 'test', totalItems: 1, timings: {} });
  }
}
const replacements = new Map();
function replaceModule(name, exports) {
  const filename = require.resolve(name);
  replacements.set(filename, require.cache[filename]);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
replaceModule('electron', { utilityProcess: { fork() { const worker = new Worker(); workers.push(worker); return worker; } } });
replaceModule('../electron/indexer/scanner.cjs', { scanCatalogDirectory() { return [{ status: 'pending', categoryId: 'test', filename: 'test.json', filePath: '/test.json' }]; } });
const manager = require('../electron/indexer/workerManager.cjs');
async function test() {
  try {
    const first = manager.indexLibraryBackground({}, { libraryPath: '/test' });
    workers[0].complete();
    await first;
    manager.terminateWorker();
    const replacement = manager.indexLibraryBackground({}, { libraryPath: '/test' });
    workers[0].emit('exit', 0);
    assert.equal(manager.getIndexingState().isIndexing, true, 'An old exit must not cancel replacement indexing');
    workers[1].complete();
    assert.equal((await replacement).importedCategories, 1);
    manager.terminateWorker();
    assert.equal(workers[1].killed, true, 'Termination must still reach the replacement worker');
    console.log('PASS late old-worker exit preserves replacement indexing and cleanup');
  } finally {
    manager.terminateWorker();
    for (const [filename, previous] of replacements) {
      if (previous) require.cache[filename] = previous;
      else delete require.cache[filename];
    }
  }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
