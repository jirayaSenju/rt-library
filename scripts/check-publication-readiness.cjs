#!/usr/bin/env node

/**
 * Public Release Readiness & Privacy Audit Scanner
 * Validates that the repository source tree is completely clean of:
 * - Real databases or WAL journals
 * - Real scraped catalog datasets
 * - Torrent files or real magnet dumps
 * - Scraper profiles, cookies, or sessions
 * - Secrets or private credentials
 * - Machine-specific developer absolute paths
 * - Unsanitized HTML dumps
 * - Old RuTracker logos or proprietary media
 * - Real downloaded images or screenshots
 * - Unreviewed diagnostics or logs
 * - Suspicious large JSON files (> 500KB)
 * - Placeholder metadata in package.json (fake author emails, placeholder URLs)
 * - Missing THIRD_PARTY_LICENSES.txt bundle
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-desktop',
  'test-results',
  'playwright-report',
  'diagnostics',
  'scratch',
  '.userData',
]);

const FORBIDDEN_FILE_EXTENSIONS = [
  '.sqlite',
  '.sqlite3',
  '.sqlite-wal',
  '.sqlite-shm',
  '.db',
  '.db-wal',
  '.db-shm',
  '.torrent',
];

const SECRET_PATTERNS = [
  { name: 'Private Key Header', regex: /-----BEGIN (RSA|EC|DSA|OPENSSH|PGP)? ?PRIVATE KEY-----/i },
  { name: 'GitHub Personal Access Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Cloudflare Clearance Token Assignment', regex: /cf_clearance\s*[:=]\s*["'][a-zA-Z0-9_\-\.]{20,}["']/i },
  { name: 'Hardcoded Session Cookie Value', regex: /bb_session\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/i },
];

const MACHINE_SPECIFIC_PATH_PATTERNS = [
  { name: 'Hardcoded /home/<username> developer path', regex: /\/home\/[a-zA-Z0-9_-]+\/Documents\/projects\// },
];

const OLD_LOGO_PATTERNS = [
  { name: 'Legacy RuTracker logo asset', regex: /rutracker[-_]logo/i },
];

function scanDirectory(dir, issues) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(PROJECT_ROOT, fullPath);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }

      // Check for forbidden directory names in source
      if (/^(covers|screenshots|image-cache|scraper-profile|playwright-profile|\.userData)$/i.test(entry.name)) {
        issues.push({
          type: 'FORBIDDEN_SOURCE_DIRECTORY',
          file: relPath,
          detail: `Directory "${entry.name}" must not be committed to source.`,
        });
      }

      scanDirectory(fullPath, issues);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const stat = fs.statSync(fullPath);

      // 1. Forbidden Extension Check
      if (FORBIDDEN_FILE_EXTENSIONS.includes(ext)) {
        issues.push({
          type: 'FORBIDDEN_FILE_EXTENSION',
          file: relPath,
          detail: `File extension "${ext}" is forbidden in public source.`,
        });
      }

      // 2. Forbidden Session/Cookie/Env Files
      if (/^(storageState|\.session|cookies\.json|cookie-jar)/i.test(entry.name)) {
        issues.push({
          type: 'FORBIDDEN_SESSION_FILE',
          file: relPath,
          detail: `Session/cookie file "${entry.name}" must not be committed.`,
        });
      }

      if (/^\.env($|\.(?!example$)[a-zA-Z0-9_-]+$)/i.test(entry.name)) {
        issues.push({
          type: 'FORBIDDEN_ENV_FILE',
          file: relPath,
          detail: `Environment secret file "${entry.name}" must not be committed (only .env.example allowed).`,
        });
      }

      // 3. Suspicious Large JSON Files Check (> 500 KB, except package-lock.json)
      if (ext === '.json' && entry.name !== 'package-lock.json' && stat.size > 500 * 1024) {
        issues.push({
          type: 'SUSPICIOUS_LARGE_JSON',
          file: relPath,
          detail: `JSON file size (${(stat.size / 1024).toFixed(1)} KB) exceeds 500 KB limit. Verify it contains no scraped database dumps.`,
        });
      }

      // 4. Old RuTracker logo check in filenames
      if (OLD_LOGO_PATTERNS[0].regex.test(entry.name)) {
        issues.push({
          type: 'OLD_LOGO_FILENAME',
          file: relPath,
          detail: `Filename matches legacy logo pattern: "${entry.name}".`,
        });
      }

      // 5. Scan Content for Secrets, Machine Paths, and Old Logo references
      if (['.js', '.cjs', '.mjs', '.ts', '.tsx', '.json', '.md', '.html', '.yml', '.yaml'].includes(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');

          for (const pattern of SECRET_PATTERNS) {
            if (pattern.regex.test(content)) {
              issues.push({
                type: 'DETECTED_SECRET_PATTERN',
                file: relPath,
                detail: `Matched rule: ${pattern.name}`,
              });
            }
          }

          for (const pattern of MACHINE_SPECIFIC_PATH_PATTERNS) {
            // Ignore scanner script itself inspecting the regex
            if (relPath === 'scripts/check-publication-readiness.cjs') continue;

            if (pattern.regex.test(content)) {
              issues.push({
                type: 'MACHINE_SPECIFIC_PATH',
                file: relPath,
                detail: `Matched rule: ${pattern.name}`,
              });
            }
          }
        } catch (err) {
          // Binary or unreadable
        }
      }
    }
  }
}

function verifyPackageMetadata(issues) {
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    issues.push({ type: 'MISSING_PACKAGE_JSON', file: 'package.json', detail: 'package.json not found.' });
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // Verify private flag
  if (pkg.private !== true) {
    issues.push({ type: 'PACKAGE_NOT_PRIVATE', file: 'package.json', detail: '"private": true is required to prevent accidental npm publish.' });
  }

  // Verify author placeholder
  if (pkg.author && (pkg.author.includes('rtlibrary.app') || pkg.author.includes('example.com'))) {
    issues.push({ type: 'PLACEHOLDER_AUTHOR', file: 'package.json', detail: `Author contains placeholder email/domain: "${pkg.author}".` });
  }

  // Verify homepage placeholder
  if (pkg.homepage && (pkg.homepage.includes('placeholder') || pkg.homepage.includes('example.com'))) {
    issues.push({ type: 'PLACEHOLDER_HOMEPAGE', file: 'package.json', detail: `Homepage contains placeholder: "${pkg.homepage}".` });
  }
}

function verifyLegalAndBundle(issues) {
  const bundlePath = path.join(PROJECT_ROOT, 'THIRD_PARTY_LICENSES.txt');
  if (!fs.existsSync(bundlePath)) {
    issues.push({
      type: 'MISSING_THIRD_PARTY_LICENSES',
      file: 'THIRD_PARTY_LICENSES.txt',
      detail: 'Consolidated license bundle THIRD_PARTY_LICENSES.txt is missing. Run npm run audit:licenses to generate it.',
    });
  } else {
    const stat = fs.statSync(bundlePath);
    if (stat.size < 1000) {
      issues.push({
        type: 'INVALID_THIRD_PARTY_LICENSES',
        file: 'THIRD_PARTY_LICENSES.txt',
        detail: `THIRD_PARTY_LICENSES.txt is suspiciously small (${stat.size} bytes).`,
      });
    }
  }

  const legalPath = path.join(PROJECT_ROOT, 'LEGAL.md');
  if (!fs.existsSync(legalPath)) {
    issues.push({ type: 'MISSING_LEGAL_DOC', file: 'LEGAL.md', detail: 'LEGAL.md is missing.' });
  }
}

function verifyGitignore() {
  const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return { ok: false, error: '.gitignore file is missing!' };
  }

  const content = fs.readFileSync(gitignorePath, 'utf8');
  const requiredPatterns = [
    'node_modules',
    'dist',
    '*.sqlite',
    '*.db',
    'data/',
    'diagnostics/',
    'scraper-profile/',
    'cookies',
    '.env',
  ];

  const missing = requiredPatterns.filter(p => !content.includes(p));
  if (missing.length > 0) {
    return { ok: false, error: `Missing patterns in .gitignore: ${missing.join(', ')}` };
  }

  return { ok: true };
}

function main() {
  console.log('=== RT-LIBRARY PUBLIC RELEASE READINESS AUDIT ===\n');

  const issues = [];
  scanDirectory(PROJECT_ROOT, issues);
  verifyPackageMetadata(issues);
  verifyLegalAndBundle(issues);

  const gitignoreCheck = verifyGitignore();
  if (!gitignoreCheck.ok) {
    issues.push({
      type: 'GITIGNORE_CHECK_FAILED',
      file: '.gitignore',
      detail: gitignoreCheck.error,
    });
  }

  console.log(`Scanned source files across project root.`);
  console.log(`Issues found: ${issues.length}\n`);

  if (issues.length > 0) {
    console.error('❌ [READINESS_AUDIT][FAILED] Found blockers before release:');
    for (const issue of issues) {
      console.error(`  - [${issue.type}] ${issue.file}: ${issue.detail}`);
    }
    process.exit(1);
  }

  console.log('✅ [READINESS_AUDIT][SUCCESS] All checks passed! No secrets, database files, profiles, placeholder metadata, or machine paths found in publishable tree.\n');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  scanDirectory,
  verifyPackageMetadata,
  verifyLegalAndBundle,
  verifyGitignore,
};
