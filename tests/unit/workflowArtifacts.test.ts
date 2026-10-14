const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createInputManifest,
  verifyInputManifest,
  createReleaseManifest,
} = require('../../scripts/workflow-artifacts.cjs')
const { classifyPaths } = require('../../scripts/classify-workflow-changes.cjs')

describe('workflow artifact manifests', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-library-workflow-artifacts-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('verifies payload hashes and exact source metadata', () => {
    const artifactDir = path.join(root, 'frontend')
    fs.mkdirSync(path.join(artifactDir, 'payload', 'assets'), { recursive: true })
    fs.writeFileSync(path.join(artifactDir, 'payload', 'index.html'), '<main>app</main>')
    fs.writeFileSync(path.join(artifactDir, 'payload', 'assets', 'app.js'), 'console.log("app")')

    const metadata = {
      commit: 'abc123',
      version: '1.2.3',
      workflowRunId: '42',
      workflowRunAttempt: '1',
    }
    const manifest = createInputManifest({ artifactDir, kind: 'frontend', metadata })

    expect(manifest.files).toHaveLength(2)
    expect(verifyInputManifest({
      artifactDir,
      kind: 'frontend',
      commit: 'abc123',
      version: '1.2.3',
      workflowRunId: '42',
      workflowRunAttempt: '1',
    })).toEqual(manifest)
    expect(() => verifyInputManifest({
      artifactDir,
      kind: 'frontend',
      commit: 'abc123',
      version: '1.2.3',
      workflowRunId: '42',
      workflowRunAttempt: '2',
    })).toThrow(/workflowRunAttempt mismatch/)
    expect(() => verifyInputManifest({
      artifactDir,
      kind: 'frontend',
      commit: 'different-commit',
      version: '1.2.3',
      workflowRunId: '42',
    })).toThrow(/commit mismatch/)

    fs.writeFileSync(path.join(artifactDir, 'payload', 'index.html'), 'tampered')
    expect(() => verifyInputManifest({
      artifactDir,
      kind: 'frontend',
      commit: 'abc123',
      version: '1.2.3',
      workflowRunId: '42',
    })).toThrow(/SHA-256 inventory/)
  })

  it('records release asset hashes, platforms, source, and workflow artifact ids', () => {
    const assetsDir = path.join(root, 'release-assets')
    fs.mkdirSync(assetsDir)
    fs.writeFileSync(path.join(assetsDir, 'RT-Library-1.2.3-linux-x86_64.AppImage'), 'linux')
    fs.writeFileSync(path.join(assetsDir, 'RT-Library-1.2.3-windows-x64-portable.exe'), 'windows')
    fs.writeFileSync(path.join(assetsDir, 'rt-library-browser-companion-v1.2.3.zip'), 'companion')

    const manifest = createReleaseManifest({
      assetsDir,
      metadata: {
        commit: 'abc123',
        version: '1.2.3',
        workflowRunId: '42',
        workflowRunAttempt: '2',
        workflowRunUrl: 'https://github.com/example/repo/actions/runs/42',
      },
      artifactIds: { linux: '10', windows: '11', companion: '12' },
    })

    expect(manifest.commit).toBe('abc123')
    expect(manifest.workflow.runId).toBe('42')
    expect(manifest.workflowArtifactIds).toEqual({ linux: '10', windows: '11', companion: '12' })
    expect(manifest.artifacts.map((asset: { platform: string }) => asset.platform)).toEqual([
      'linux',
      'windows',
      'browser-companion',
    ])
    expect(manifest.artifacts.every((asset: { sha256: string }) => /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true)
  })

  it('maps docs, UI, Companion, updater, and packaging changes to their affected jobs', () => {
    expect(classifyPaths(['docs/releasing.md', '.github/workflows/ci.yml']).non_runtime_only).toBe(true)
    expect(classifyPaths(['src/components/App.tsx'])).toMatchObject({
      desktop_changed: true,
      package_sensitive: false,
    })
    expect(classifyPaths(['browser-companion/src/background.js'])).toMatchObject({
      companion_changed: true,
      package_sensitive: false,
    })
    expect(classifyPaths(['electron/updater/updaterManager.cjs'])).toMatchObject({
      desktop_changed: true,
      package_sensitive: true,
      updater_changed: true,
    })
    expect(classifyPaths(['.github/workflows/release.yml'])).toMatchObject({
      package_sensitive: true,
      updater_changed: true,
    })
  })
})
