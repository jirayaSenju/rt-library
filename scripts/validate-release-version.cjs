#!/usr/bin/env node

/**
 * RT-Library Semantic Version & Release Validation Script (V3-36)
 * 
 * Validates:
 * 1. Semantic Versioning format (MAJOR.MINOR.PATCH[-PRERELEASE])
 * 2. package.json and package-lock.json version synchronization
 * 3. Git tag format (vMAJOR.MINOR.PATCH) and strict match against package.json
 * 4. Presence of version entry in CHANGELOG.md
 * 5. Presence of LICENSE and package.json license field
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Strict Regex for Semantic Versioning (vMAJOR.MINOR.PATCH without alpha/beta/rc)
const STRICT_SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STRICT_TAG_REGEX = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function validateReleaseVersion(targetTag) {
  const issues = [];
  const info = {};

  // 1. Read package.json
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    issues.push('Missing package.json at project root.');
    return { valid: false, issues, info };
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const pkgVersion = (pkg.version || '').trim();
  info.pkgVersion = pkgVersion;
  info.pkgName = pkg.name;
  info.license = pkg.license;

  if (!pkgVersion) {
    issues.push('package.json does not contain a "version" field.');
  } else if (!STRICT_SEMVER_REGEX.test(pkgVersion)) {
    issues.push(`package.json version "${pkgVersion}" is not valid strict Semantic Versioning (MAJOR.MINOR.PATCH without leading zeros or prerelease suffixes).`);
  }

  if (pkg.license !== 'MIT') {
    issues.push(`package.json license is "${pkg.license}", expected "MIT".`);
  }

  // 2. Read package-lock.json
  const lockPath = path.join(PROJECT_ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const lockVersion = (lock.version || '').trim();
    info.lockVersion = lockVersion;

    if (lockVersion !== pkgVersion) {
      issues.push(`package-lock.json version ("${lockVersion}") does not match package.json version ("${pkgVersion}").`);
    }
  } else {
    issues.push('Missing package-lock.json at project root.');
  }

  // 3. Validate Git Tag (strict vMAJOR.MINOR.PATCH)
  const tag = (targetTag || process.env.GITHUB_REF_NAME || process.env.RELEASE_TAG || '').trim();
  if (tag) {
    info.tag = tag;
    if (!STRICT_TAG_REGEX.test(tag)) {
      issues.push(`Release tag "${tag}" is invalid. Tag must strictly match "vMAJOR.MINOR.PATCH" (e.g. v${pkgVersion}). Prerelease tags (alpha/beta/rc) are not supported in this release.`);
    } else {
      const tagVersion = tag.slice(1);
      if (tagVersion !== pkgVersion) {
        issues.push(`Release tag "${tag}" (version ${tagVersion}) does not match package.json version ("${pkgVersion}").`);
      }
    }
  }

  // 4. Validate CHANGELOG.md
  const changelogPath = path.join(PROJECT_ROOT, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const changelogContent = fs.readFileSync(changelogPath, 'utf8');
    const versionHeaderRegex = new RegExp(`##\\s*\\[(?:v)?${pkgVersion.replace(/\./g, '\\.')}\\]`, 'i');
    if (!versionHeaderRegex.test(changelogContent)) {
      issues.push(`CHANGELOG.md does not contain an entry header for version [${pkgVersion}].`);
    } else {
      info.changelogEntryFound = true;
    }
  } else {
    issues.push('Missing CHANGELOG.md at project root.');
  }

  // 5. Validate LICENSE
  const licensePath = path.join(PROJECT_ROOT, 'LICENSE');
  if (!fs.existsSync(licensePath)) {
    issues.push('Missing LICENSE file at project root.');
  } else {
    info.licenseFileFound = true;
  }

  return {
    valid: issues.length === 0,
    issues,
    info,
  };
}

function main() {
  const cliTag = process.argv[2];
  console.log('================================================================================');
  console.log('       RT-LIBRARY RELEASE VERSION & SEMVER VALIDATION                          ');
  console.log('================================================================================\n');

  const result = validateReleaseVersion(cliTag);

  console.log(`Package Name:    ${result.info.pkgName || 'unknown'}`);
  console.log(`Package Version: ${result.info.pkgVersion || 'none'}`);
  console.log(`Lockfile Version:${result.info.lockVersion || 'none'}`);
  console.log(`Release Tag:     ${result.info.tag || '(none specified)'}`);
  console.log(`License Field:   ${result.info.license || 'none'}`);
  console.log(`CHANGELOG Entry: ${result.info.changelogEntryFound ? 'FOUND' : 'MISSING'}\n`);

  if (!result.valid) {
    console.error('❌ RELEASE VERSION VALIDATION FAILED:');
    result.issues.forEach((issue, idx) => {
      console.error(`  ${idx + 1}. ${issue}`);
    });
    console.log('\n================================================================================');
    process.exit(1);
  }

  console.log('✅ RELEASE VERSION VALIDATION PASSED: All SemVer, metadata, and license criteria met.\n');
  console.log('================================================================================');
}

if (require.main === module) {
  main();
}

module.exports = {
  validateReleaseVersion,
  SEMVER_REGEX: STRICT_SEMVER_REGEX,
  STRICT_SEMVER_REGEX,
  STRICT_TAG_REGEX,
};

