#!/usr/bin/env node

/**
 * RT-Library Release Preparation Helper (V3-36)
 * 
 * Prepares the codebase for a new SemVer release:
 * 1. Validates the proposed version format
 * 2. Synchronizes package.json and package-lock.json via npm version --no-git-tag-version
 * 3. Verifies CHANGELOG.md contains the corresponding version header
 * 4. Outputs the project workflow (commit on dev, PR, then tag after merge)
 * 
 * STRICT RULE: Does NOT execute any Git commit, tag, push, or publication commands.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SEMVER_REGEX } = require('./validate-release-version.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function prepareRelease(newVersion) {
  console.log('================================================================================');
  console.log('       RT-LIBRARY RELEASE PREPARATION HELPER                                   ');
  console.log('================================================================================\n');

  if (!newVersion) {
    console.error('❌ Error: Please provide the target release version.');
    console.error('Usage: node scripts/prepare-release.cjs <version>');
    console.error('Example: node scripts/prepare-release.cjs 1.1.0\n');
    process.exit(1);
  }

  // Strip leading 'v' if provided
  const cleanVersion = newVersion.startsWith('v') ? newVersion.slice(1) : newVersion;

  if (!SEMVER_REGEX.test(cleanVersion)) {
    console.error(`❌ Error: "${cleanVersion}" is not a valid Semantic Version (MAJOR.MINOR.PATCH).`);
    process.exit(1);
  }

  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;

  console.log(`Current Version: ${currentVersion}`);
  console.log(`Target Version:  ${cleanVersion}\n`);

  if (currentVersion === cleanVersion) {
    console.log(`ℹ️ package.json is already at version ${cleanVersion}.`);
  } else {
    console.log(`>>> Updating package.json and package-lock.json to ${cleanVersion}...`);
    try {
      execSync(`npm version ${cleanVersion} --no-git-tag-version`, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      });
      console.log(`✅ Version updated in package.json & package-lock.json.`);
    } catch (err) {
      console.error('❌ Failed to update version via npm:', err.message);
      process.exit(1);
    }
  }

  // Check CHANGELOG.md
  const changelogPath = path.join(PROJECT_ROOT, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const content = fs.readFileSync(changelogPath, 'utf8');
    const hasHeader = new RegExp(`##\\s*\\[(?:v)?${cleanVersion.replace(/\./g, '\\.')}\\]`, 'i').test(content);
    if (!hasHeader) {
      console.warn(`\n⚠️  WARNING: CHANGELOG.md does not yet have a header for [${cleanVersion}].`);
      console.warn(`   Please add "## [${cleanVersion}] - YYYY-MM-DD" before tagging.`);
    } else {
      console.log(`✅ CHANGELOG.md entry for [${cleanVersion}] found.`);
    }
  }

  console.log('\n================================================================================');
  console.log('NEXT MANUAL STEPS FOR MAINTAINER:');
  console.log('================================================================================');
  console.log('0. Use release preparation only when commits since the previous release include feat, fix, perf, revert, or a non-doc breaking change.');
  console.log('   For documentation-only changes (docs:), do not bump the app version or create a release tag.');
  console.log('1. Review version and changelog changes:');
  console.log('   git diff package.json package-lock.json CHANGELOG.md');
  console.log('2. Run local release readiness checks:');
  console.log(`   npm test && npm run build && npm run audit:licenses && npm run release:check && npm run release:validate v${cleanVersion}`);
  console.log('3. Commit the version update on the dev branch and push it:');
  console.log('   git add package.json package-lock.json CHANGELOG.md');
  console.log(`   git commit -m "chore(release): v${cleanVersion}"`);
  console.log('   git push -u origin dev');
  console.log('4. Open a Pull Request from dev to main; wait for all required Actions checks to pass, then merge.');
  console.log('5. After the merge, update main and create the annotated release tag:');
  console.log('   git switch main && git pull --ff-only origin main');
  console.log(`   npm run release:validate v${cleanVersion}`);
  console.log(`   git tag -a v${cleanVersion} -m "Release v${cleanVersion}"`);
  console.log(`   git push origin v${cleanVersion}`);
  console.log('================================================================================\n');
}

if (require.main === module) {
  const target = process.argv[2];
  prepareRelease(target);
}

module.exports = { prepareRelease };
