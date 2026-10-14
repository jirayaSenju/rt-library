#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFiles(root, base = root) {
  if (!fs.existsSync(root)) throw new Error(`Artifact payload is missing: ${root}`);
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in release artifacts: ${fullPath}`);
    return entry.isDirectory() ? listFiles(fullPath, base) : [{
      path: path.relative(base, fullPath).split(path.sep).join('/'),
      sha256: sha256File(fullPath),
    }];
  }).sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function digestFiles(files) {
  return crypto.createHash('sha256')
    .update(files.map(({ path: name, sha256 }) => `${name}\0${sha256}\n`).join(''))
    .digest('hex');
}

function createInputManifest({ artifactDir, kind, platform = 'universal', metadata }) {
  const payloadDir = path.join(artifactDir, 'payload');
  const files = listFiles(payloadDir);
  if (files.length === 0) throw new Error(`Artifact payload is empty: ${payloadDir}`);
  const manifest = {
    schemaVersion: 1,
    kind,
    platform,
    commit: metadata.commit,
    version: metadata.version,
    workflowRunId: String(metadata.workflowRunId),
    workflowRunAttempt: String(metadata.workflowRunAttempt || '1'),
    files,
    sha256: digestFiles(files),
  };
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function verifyInputManifest({ artifactDir, kind, commit, version, workflowRunId, workflowRunAttempt }) {
  const manifestPath = path.join(artifactDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Artifact manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = {
    schemaVersion: 1,
    kind,
    commit,
    version: String(version).replace(/^v/, ''),
    workflowRunId: String(workflowRunId),
  };
  if (workflowRunAttempt !== undefined) expected.workflowRunAttempt = String(workflowRunAttempt);
  for (const [field, value] of Object.entries(expected)) {
    if (manifest[field] !== value) {
      throw new Error(`Artifact manifest ${field} mismatch: expected ${value}, found ${manifest[field]}`);
    }
  }
  const files = listFiles(path.join(artifactDir, 'payload'));
  if (JSON.stringify(files) !== JSON.stringify(manifest.files) || digestFiles(files) !== manifest.sha256) {
    throw new Error('Artifact payload SHA-256 inventory does not match its manifest.');
  }
  return manifest;
}

function platformForAsset(filename) {
  if (filename.endsWith('.AppImage') || filename === 'latest-linux.yml') return 'linux';
  if (filename.endsWith('.exe') || filename === 'latest.yml') return 'windows';
  if (filename.endsWith('.zip')) return 'browser-companion';
  if (filename === 'SHA256SUMS.txt') return 'checksums';
  if (filename.endsWith('.blockmap')) return 'update-metadata';
  return 'release-metadata';
}

function createReleaseManifest({ assetsDir, metadata, artifactIds = {} }) {
  const filenames = fs.readdirSync(assetsDir)
    .filter((filename) => filename !== 'release-manifest.json')
    .sort();
  if (filenames.length === 0) throw new Error(`Release assets directory is empty: ${assetsDir}`);
  const artifacts = filenames.map((filename) => ({
    filename,
    platform: platformForAsset(filename),
    sha256: sha256File(path.join(assetsDir, filename)),
  }));
  const manifest = {
    schemaVersion: 1,
    version: metadata.version,
    commit: metadata.commit,
    workflow: {
      runId: String(metadata.workflowRunId),
      runAttempt: String(metadata.workflowRunAttempt || '1'),
      url: metadata.workflowRunUrl,
    },
    workflowArtifactIds: {
      linux: String(artifactIds.linux || ''),
      windows: String(artifactIds.windows || ''),
      companion: String(artifactIds.companion || ''),
    },
    artifacts,
  };
  fs.writeFileSync(path.join(assetsDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const metadata = {
    commit: process.env.RELEASE_COMMIT || process.env.GITHUB_SHA,
    version: String(process.env.RELEASE_VERSION || require('../package.json').version).replace(/^v/, ''),
    workflowRunId: process.env.GITHUB_RUN_ID,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || '1',
    workflowRunUrl: `${process.env.GITHUB_SERVER_URL || ''}/${process.env.GITHUB_REPOSITORY || ''}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`,
  };

  if (command === 'create-input') {
    const [artifactDir, kind, platform] = args;
    createInputManifest({ artifactDir, kind, platform, metadata });
  } else if (command === 'verify-input') {
    const [artifactDir, kind, commit, version, workflowRunId, workflowRunAttempt] = args;
    verifyInputManifest({ artifactDir, kind, commit, version, workflowRunId, workflowRunAttempt });
    console.log(`Verified ${kind} artifact for ${version} at ${commit}.`);
  } else if (command === 'create-release') {
    const [assetsDir] = args;
    createReleaseManifest({
      assetsDir,
      metadata,
      artifactIds: {
        linux: process.env.LINUX_ARTIFACT_ID,
        windows: process.env.WINDOWS_ARTIFACT_ID,
        companion: process.env.COMPANION_ARTIFACT_ID,
      },
    });
  } else {
    throw new Error('Usage: workflow-artifacts.cjs create-input <dir> <kind> <platform> | verify-input <dir> <kind> <commit> <version> <run-id> [run-attempt] | create-release <assets-dir>');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Workflow artifact validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  createInputManifest,
  verifyInputManifest,
  createReleaseManifest,
  listFiles,
  digestFiles,
};
