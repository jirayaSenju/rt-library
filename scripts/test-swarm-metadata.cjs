const fs = require('node:fs');
const path = require('node:path');
const { executeTask } = require('../electron/torrent/metadataWorker.cjs');
const dataDir = path.resolve(process.argv[2] || '../../ecohub-app/data');
const required = ['gamecube.json', 'wii.json', '3ds.json', 'ds.json', 'xbox.json', 'dreamcast.json'];
const samples = [];
for (const filename of required) {
  const json = JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf8'));
  const item = (json.items || json).find(candidate => typeof (candidate.content?.magnet || candidate.magnet) === 'string');
  if (item) samples.push({ itemId: item.id, magnet: item.content?.magnet || item.magnet, catalog: filename });
}
(async () => {
  const results = [];
  for (const sample of samples.slice(0, 6)) {
    const started = Date.now();
    const result = await executeTask({ taskId: `probe_${sample.itemId}`, ...sample });
    results.push({ catalog: sample.catalog, itemId: sample.itemId, infoHash: result.infoHash, trackers: result.metadata?.trackers?.length || 0, seeds: result.swarm?.seeds ?? null, leechers: result.swarm?.leechers ?? null, peers: result.swarm?.peers ?? null, source: result.swarm?.source || 'unknown', status: result.swarm?.status || 'failed', durationMs: Date.now() - started });
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
