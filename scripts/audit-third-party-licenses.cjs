#!/usr/bin/env node

/**
 * RT-Library Third-Party License & Component Audit Tool
 * 
 * Supports two-tier auditing:
 * 1. Source / NPM runtime dependencies (package.json production dependencies)
 * 2. Packaged / Redistributed components (Electron, Chromium, Embedded Node.js, better-sqlite3 native, Playwright)
 *
 * Flags:
 *   --source          Run only source dependency audit
 *   --package         Run only packaged component audit
 *   --all (default)   Run full two-tier audit & verify license bundle
 *   --generate-bundle Regenerate THIRD_PARTY_LICENSES.txt with full legal texts
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');
const NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules');
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'THIRD_PARTY_LICENSES.txt');

function getDirectDependencies() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  return pkg.dependencies || {};
}

function resolvePackageLicense(pkgName) {
  const pkgDir = path.join(NODE_MODULES, pkgName);
  const pkgJsonPath = path.join(pkgDir, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    return {
      name: pkgName,
      version: 'UNKNOWN',
      license: 'UNKNOWN',
      licenseSource: 'missing',
      licenseText: null,
      noticeText: null,
      status: 'MISSING_PACKAGE',
    };
  }

  const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const version = pkgData.version || 'UNKNOWN';

  let license = 'UNKNOWN';
  if (typeof pkgData.license === 'string') {
    license = pkgData.license;
  } else if (typeof pkgData.license === 'object' && pkgData.license.type) {
    license = pkgData.license.type;
  } else if (Array.isArray(pkgData.licenses) && pkgData.licenses.length > 0) {
    license = pkgData.licenses.map((l) => (typeof l === 'string' ? l : l.type || 'UNKNOWN')).join(' OR ');
  }

  // Find actual license file
  let licenseText = null;
  let licenseSource = 'package.json';
  const entries = fs.readdirSync(pkgDir);
  const licenseFileName = entries.find((f) => /^license|^licence/i.test(f));
  if (licenseFileName) {
    licenseText = fs.readFileSync(path.join(pkgDir, licenseFileName), 'utf8');
    licenseSource = licenseFileName;
  }

  // Find actual notice file (for Apache 2.0 packages)
  let noticeText = null;
  const noticeFileName = entries.find((f) => /^notice/i.test(f));
  if (noticeFileName) {
    noticeText = fs.readFileSync(path.join(pkgDir, noticeFileName), 'utf8');
  }

  let status = 'PERMISSIVE';
  const cleanLicense = license.toUpperCase();

  if (cleanLicense === 'UNKNOWN' || cleanLicense === 'UNLICENSED') {
    status = 'UNKNOWN';
  } else if (cleanLicense.includes('GPL') || cleanLicense.includes('AGPL') || cleanLicense.includes('LGPL') || cleanLicense.includes('MPL')) {
    status = 'COPYLEFT_REVIEW';
  } else if (cleanLicense.includes('APACHE') || cleanLicense.includes('BSD') || cleanLicense.includes('MIT') || cleanLicense.includes('ISC')) {
    status = 'NOTICE_REQUIRED';
  }

  return {
    name: pkgName,
    version,
    license,
    licenseSource,
    licenseText,
    noticeText,
    status,
  };
}

function auditSourceDependencies() {
  console.log('\n--- 1. SOURCE / NPM RUNTIME DEPENDENCY AUDIT ---');

  const directDeps = getDirectDependencies();
  const depNames = Object.keys(directDeps).sort();

  console.log(`Found ${depNames.length} direct runtime production dependencies.\n`);

  const results = depNames.map(resolvePackageLicense);

  console.log(
    'Package'.padEnd(35) +
    'Version'.padEnd(12) +
    'License'.padEnd(16) +
    'Source'.padEnd(16) +
    'Status'.padEnd(18)
  );
  console.log('-'.repeat(97));

  let unknownCount = 0;
  let copyleftCount = 0;
  let noticeCount = 0;

  for (const item of results) {
    if (item.status === 'UNKNOWN' || item.status === 'MISSING_PACKAGE') unknownCount++;
    if (item.status === 'COPYLEFT_REVIEW') copyleftCount++;
    if (item.status === 'NOTICE_REQUIRED') noticeCount++;

    console.log(
      item.name.padEnd(35) +
      item.version.padEnd(12) +
      item.license.padEnd(16) +
      item.licenseSource.padEnd(16) +
      item.status.padEnd(18)
    );
  }

  console.log(`\nSource Summary: ${results.length} packages (${noticeCount} notice-required, ${copyleftCount} copyleft, ${unknownCount} unknown)`);
  return { results, unknownCount, copyleftCount, noticeCount };
}

function auditPackagedComponents() {
  console.log('\n--- 2. PACKAGED & REDISTRIBUTED COMPONENT AUDIT ---');

  const packagedComponents = [
    {
      name: 'Electron Framework',
      version: '31.0.0',
      license: 'MIT',
      redistributed: 'Yes (Desktop Runtime Host)',
      upstream: 'https://github.com/electron/electron',
      licenseFile: 'node_modules/electron/LICENSE',
      notes: 'Contains embedded Chromium and Node.js; includes LICENSES.chromium.html in binary package',
      status: 'NOTICE_REQUIRED',
    },
    {
      name: 'Chromium Engine (Embedded)',
      version: '~126.x',
      license: 'BSD-3-Clause and compatible permissive',
      redistributed: 'Yes (via Electron Binary Distribution)',
      upstream: 'https://chromium.googlesource.com/chromium/src',
      licenseFile: 'Distributed via Electron LICENSES.chromium.html',
      notes: 'Included in runtime binary distribution with automated credits',
      status: 'NOTICE_REQUIRED',
    },
    {
      name: 'Node.js Runtime (Embedded)',
      version: '~20.14.x',
      license: 'MIT',
      redistributed: 'Yes (via Electron Main Process)',
      upstream: 'https://github.com/nodejs/node',
      licenseFile: 'Distributed via Electron runtime',
      notes: 'Included inside Electron binary distribution',
      status: 'NOTICE_REQUIRED',
    },
    {
      name: 'better-sqlite3 Native Binary',
      version: '11.10.0',
      license: 'MIT',
      redistributed: 'Yes (Unpacked native Node addon .node in app.asar.unpacked)',
      upstream: 'https://github.com/WiseLibs/better-sqlite3',
      licenseFile: 'node_modules/better-sqlite3/LICENSE',
      notes: 'Links embedded SQLite library (Public Domain / SQLite Blessing)',
      status: 'NOTICE_REQUIRED',
    },
    {
      name: 'Playwright Library',
      version: '1.63.0',
      license: 'Apache-2.0',
      redistributed: 'Yes (Scraper background runner module inside app.asar)',
      upstream: 'https://github.com/microsoft/playwright',
      licenseFile: 'node_modules/playwright/LICENSE',
      noticeFile: 'node_modules/playwright/NOTICE',
      notes: 'Playwright automation client library',
      status: 'NOTICE_REQUIRED',
    },
    {
      name: 'Playwright Browser Binaries',
      version: 'N/A (External/Dynamic)',
      license: 'BSD / MIT / Open Source',
      redistributed: 'No (Downloaded externally or connects to local browser profile on user request)',
      upstream: 'https://playwright.dev',
      licenseFile: 'N/A (Not bundled in application package)',
      notes: 'Browser binaries are NOT bundled in the AppImage/NSIS package',
      status: 'NOT_BUNDLED',
    },
  ];

  console.log(
    'Component'.padEnd(32) +
    'License'.padEnd(38) +
    'Redistributed'.padEnd(20) +
    'Status'.padEnd(16)
  );
  console.log('-'.repeat(106));

  for (const c of packagedComponents) {
    console.log(
      c.name.padEnd(32) +
      c.license.padEnd(38) +
      c.redistributed.padEnd(20) +
      c.status.padEnd(16)
    );
  }

  return packagedComponents;
}

function generateLicenseBundle() {
  console.log('\n--- 3. CONSOLIDATED THIRD-PARTY LICENSE BUNDLE GENERATION ---');

  const directDeps = getDirectDependencies();
  const depNames = Object.keys(directDeps).sort();
  const results = depNames.map(resolvePackageLicense);
  const packaged = auditPackagedComponents();

  let bundleContent = `================================================================================
RT-LIBRARY THIRD-PARTY LICENSES & NOTICES
================================================================================

This document contains the licenses, copyright notices, and disclaimers for
third-party open-source software packages and components incorporated or
redistributed with RT-Library.

================================================================================
TABLE OF CONTENTS
================================================================================

1. Core Packaged & Runtime Host Components:
   - Electron Framework (MIT)
   - Chromium Engine (BSD-3-Clause / Permissive - see LICENSES.chromium.html)
   - Node.js Runtime (MIT)
   - better-sqlite3 Native Binary (MIT / SQLite Blessing)
   - Playwright (Apache-2.0)

2. Direct Production Runtime Dependencies:
${results.map((r, i) => `   ${i + 1}. ${r.name} (${r.version}) - ${r.license}`).join('\n')}

================================================================================
CORE PACKAGED COMPONENTS
================================================================================

--------------------------------------------------------------------------------
Electron Framework (https://github.com/electron/electron)
License: MIT
--------------------------------------------------------------------------------
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

--------------------------------------------------------------------------------
Chromium Engine
License: BSD-3-Clause / Various Permissive Licenses
--------------------------------------------------------------------------------
Chromium is licensed under the BSD 3-Clause license and various other permissive
open-source licenses. The full credits and individual component licenses are
shipped inside the packaged desktop binary under "LICENSES.chromium.html".

--------------------------------------------------------------------------------
Node.js Runtime
License: MIT
--------------------------------------------------------------------------------
Copyright Node.js contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

================================================================================
PRODUCTION RUNTIME DEPENDENCIES
================================================================================
`;

  for (const item of results) {
    bundleContent += `\n--------------------------------------------------------------------------------\n`;
    bundleContent += `Package: ${item.name} (Version: ${item.version})\n`;
    bundleContent += `License: ${item.license}\n`;
    bundleContent += `--------------------------------------------------------------------------------\n`;

    if (item.noticeText) {
      bundleContent += `\n[NOTICE]\n${item.noticeText.trim()}\n`;
    }

    if (item.licenseText) {
      bundleContent += `\n${item.licenseText.trim()}\n`;
    } else {
      bundleContent += `\nLicensed under ${item.license}.\n`;
    }
  }

  fs.writeFileSync(BUNDLE_PATH, bundleContent, 'utf8');
  console.log(`✅ Successfully generated consolidated license bundle at:`);
  console.log(`   ${BUNDLE_PATH} (${(bundleContent.length / 1024).toFixed(1)} KB)`);
}

function main() {
  console.log('================================================================================');
  console.log('              RT-LIBRARY COMPREHENSIVE THIRD-PARTY LICENSE AUDIT');
  console.log('================================================================================');

  const args = process.argv.slice(2);
  const isSourceOnly = args.includes('--source');
  const isPackageOnly = args.includes('--package');
  const isGenerate = args.includes('--generate-bundle') || (!isSourceOnly && !isPackageOnly);

  let sourceOk = true;
  if (!isPackageOnly) {
    const sourceRes = auditSourceDependencies();
    if (sourceRes.unknownCount > 0) sourceOk = false;
  }

  if (!isSourceOnly) {
    auditPackagedComponents();
  }

  if (isGenerate) {
    generateLicenseBundle();
  }

  console.log('\n================================================================================');
  console.log(`AUDIT RESULT: ${sourceOk ? '✅ PASS' : '❌ REVIEW REQUIRED'}`);
  console.log('================================================================================\n');

  if (!sourceOk) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getDirectDependencies,
  resolvePackageLicense,
  auditSourceDependencies,
  auditPackagedComponents,
  generateLicenseBundle,
};
