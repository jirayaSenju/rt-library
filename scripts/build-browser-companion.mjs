import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'browser-companion');
const output = path.join(source, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Copy all extension runtime files flat into dist
await cp(path.join(source, 'src'), output, { recursive: true });

// Read manifest, normalize paths to flat archive root, and write to dist
const rawManifest = await readFile(path.join(source, 'manifest.json'), 'utf8');
const manifest = JSON.parse(rawManifest);
if (manifest.background?.service_worker?.startsWith('src/')) {
  manifest.background.service_worker = manifest.background.service_worker.replace(/^src\//, '');
}
if (manifest.action?.default_popup?.startsWith('src/')) {
  manifest.action.default_popup = manifest.action.default_popup.replace(/^src\//, '');
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('Browser Companion unpacked extension built at browser-companion/dist');
