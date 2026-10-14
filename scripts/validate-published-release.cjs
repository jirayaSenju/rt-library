#!/usr/bin/env node

/**
 * Validates that all required release assets for a published release exist and are publicly accessible.
 * Usage:
 *   node scripts/validate-published-release.cjs [version]
 * Example:
 *   node scripts/validate-published-release.cjs 1.1.0
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const REPO_OWNER = 'jirayaSenju';
const REPO_NAME = 'rt-library';

function fetchHead(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error(`Too many redirects fetching ${targetUrl}`));
    }

    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      parsed,
      {
        method: 'HEAD',
        headers: {
          'User-Agent': 'RT-Library-Release-Validator',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, targetUrl).toString();
          return resolve(fetchHead(redirectUrl, maxRedirects - 1));
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          url: targetUrl,
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error(`Timeout fetching ${targetUrl}`));
    });
    req.end();
  });
}

async function validatePublishedRelease(version) {
  const cleanVersion = version.replace(/^v/, '');
  const tag = `v${cleanVersion}`;
  const baseUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag}`;

  console.log(`\n=== VALIDATING PUBLISHED GITHUB RELEASE: ${tag} ===`);
  console.log(`Base URL: ${baseUrl}\n`);

  const requiredAssets = [
    { name: `RT-Library-${cleanVersion}-linux-x86_64.AppImage`, category: 'Linux Binary', required: true },
    { name: 'latest-linux.yml', category: 'Linux Update Metadata', required: true },
    { name: `RT-Library-${cleanVersion}-windows-x64-portable.exe`, category: 'Windows Portable', required: true },
    { name: 'latest.yml', category: 'Windows Update Metadata', required: true },
    { name: `rt-library-browser-companion-v${cleanVersion}.zip`, category: 'Browser Companion', required: true },
    { name: 'SHA256SUMS.txt', category: 'Integrity Checksums', required: true },
    { name: 'release-manifest.json', category: 'Build Provenance', required: true },
  ];

  let anyFailed = false;

  for (const asset of requiredAssets) {
    const assetUrl = `${baseUrl}/${asset.name}`;
    try {
      const res = await fetchHead(assetUrl);
      if (res.statusCode === 200) {
        console.log(`  [200 OK]  ${asset.category.padEnd(24)}: ${asset.name}`);
      } else {
        console.error(`  [${res.statusCode} ❌]  ${asset.category.padEnd(24)}: ${asset.name} (MISSING/NOT_FOUND)`);
        anyFailed = true;
      }
    } catch (err) {
      console.error(`  [ERR ❌]  ${asset.category.padEnd(24)}: ${asset.name} (${err.message})`);
      anyFailed = true;
    }
  }

  console.log('\n--------------------------------------------------');
  if (anyFailed) {
    console.error(`❌ RELEASE VALIDATION FAILED: One or more required release assets are missing from ${tag}!\n`);
    return false;
  } else {
    console.log(`✅ RELEASE VALIDATION PASSED: All required update and binary assets are published for ${tag}!\n`);
    return true;
  }
}

if (require.main === module) {
  const versionArg = process.argv[2] || require('../package.json').version;
  validatePublishedRelease(versionArg).then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}

module.exports = {
  validatePublishedRelease,
};

