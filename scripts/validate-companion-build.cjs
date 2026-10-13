const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'browser-companion', 'dist');
const manifestPath = path.join(root, 'manifest.json');
const errors = [];

function requireFile(relative, source) {
  if (typeof relative !== 'string' || !relative || relative.includes('*')) return;
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    errors.push(`${source} references missing file: ${relative}`);
  }
}

function collectManifestFiles(manifest) {
  if (manifest.background?.service_worker) requireFile(manifest.background.service_worker, 'manifest.background.service_worker');
  if (manifest.background?.page) requireFile(manifest.background.page, 'manifest.background.page');
  if (manifest.action?.default_popup) requireFile(manifest.action.default_popup, 'manifest.action.default_popup');
  if (manifest.browser_action?.default_popup) requireFile(manifest.browser_action.default_popup, 'manifest.browser_action.default_popup');
  if (manifest.page_action?.default_popup) requireFile(manifest.page_action.default_popup, 'manifest.page_action.default_popup');
  if (manifest.options_page) requireFile(manifest.options_page, 'manifest.options_page');
  if (manifest.options_ui?.page) requireFile(manifest.options_ui.page, 'manifest.options_ui.page');
  if (manifest.devtools_page) requireFile(manifest.devtools_page, 'manifest.devtools_page');
  if (manifest.side_panel?.default_path) requireFile(manifest.side_panel.default_path, 'manifest.side_panel.default_path');
  for (const [name, file] of Object.entries(manifest.icons || {})) requireFile(file, `manifest.icons.${name}`);
  for (const [name, file] of Object.entries(manifest.action?.default_icon || {})) requireFile(file, `manifest.action.default_icon.${name}`);
  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) requireFile(file, 'manifest.content_scripts.js');
    for (const file of script.css || []) requireFile(file, 'manifest.content_scripts.css');
  }
  for (const override of Object.values(manifest.chrome_url_overrides || {})) requireFile(override, 'manifest.chrome_url_overrides');
  for (const page of manifest.sandbox?.pages || []) requireFile(page, 'manifest.sandbox.pages');
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

try {
  if (!fs.existsSync(manifestPath)) throw new Error('browser-companion/dist/manifest.json is missing; run npm run companion:build first.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  collectManifestFiles(manifest);

  const jsFiles = walk(root).filter(file => file.endsWith('.js'));
  const getUrlPattern = /chrome\.runtime\.getURL\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  for (const file of jsFiles) {
    const contents = fs.readFileSync(file, 'utf8');
    for (const match of contents.matchAll(getUrlPattern)) {
      requireFile(match[2], path.relative(root, file));
    }
  }
} catch (error) {
  errors.push(error.message);
}

if (errors.length) {
  console.error('COMPANION_BUILD_VALIDATION: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('COMPANION_BUILD_VALIDATION: PASS');
}
