/**
 * Release validation script to ensure all auto-updater metadata and binary assets
 * required for Linux AppImage and Windows Portable self-updating exist and are consistent.
 */

const fs = require('fs');
const path = require('path');

let yaml;
try {
  yaml = require('js-yaml');
} catch (_) {
  // Zero-dependency fallback parser for flat latest*.yml metadata files
  yaml = {
    load: (content) => {
      const result = { files: [] };
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        const vMatch = trimmed.match(/^version:\s*['"]?([^'"]+)['"]?$/);
        if (vMatch) result.version = vMatch[1];
        const urlMatch = trimmed.match(/^-\s*url:\s*['"]?([^'"]+)['"]?$/) || trimmed.match(/^url:\s*['"]?([^'"]+)['"]?$/);
        if (urlMatch) {
          result.files.push({ url: urlMatch[1] });
        }
        const pathMatch = trimmed.match(/^path:\s*['"]?([^'"]+)['"]?$/);
        if (pathMatch && result.files.length === 0) {
          result.files.push({ url: pathMatch[1] });
        }
      }
      return result;
    },
  };
}

function validateUpdateArtifacts(dirPath, targetVersion) {
  const root = path.resolve(dirPath);
  console.log(`[UPDATER_VALIDATOR] Inspecting update artifacts in: ${root}`);

  const issues = [];
  const files = fs.readdirSync(root);

  // 1. Linux validation (if linux artifacts are present)
  const hasAppImage = files.some(f => f.endsWith('.AppImage'));
  if (hasAppImage) {
    const latestLinuxPath = path.join(root, 'latest-linux.yml');
    if (!fs.existsSync(latestLinuxPath)) {
      issues.push('Missing latest-linux.yml in artifacts directory.');
    } else {
      try {
        const content = fs.readFileSync(latestLinuxPath, 'utf8');
        const parsed = yaml.load(content);
        if (!parsed.version) {
          issues.push('latest-linux.yml is missing "version" field.');
        } else if (targetVersion && parsed.version !== targetVersion) {
          issues.push(`latest-linux.yml version mismatch: expected ${targetVersion}, found ${parsed.version}`);
        }
        if (!parsed.files || parsed.files.length === 0) {
          issues.push('latest-linux.yml has no file entries.');
        } else {
          for (const fileEntry of parsed.files) {
            const binaryName = fileEntry.url;
            if (!fs.existsSync(path.join(root, binaryName))) {
              issues.push(`Binary referenced in latest-linux.yml (${binaryName}) does not exist.`);
            }
          }
        }
        console.log(`  - latest-linux.yml: ✅ VALID (version ${parsed.version})`);
      } catch (err) {
        issues.push(`Failed to parse latest-linux.yml: ${err.message}`);
      }
    }
  }

  // 2. Windows validation (if windows artifacts are present)
  const hasExe = files.some(f => f.endsWith('.exe'));
  if (hasExe) {
    const latestWinPath = path.join(root, 'latest.yml');
    if (!fs.existsSync(latestWinPath)) {
      issues.push('Missing latest.yml (Windows update metadata) in artifacts directory.');
    } else {
      try {
        const content = fs.readFileSync(latestWinPath, 'utf8');
        const parsed = yaml.load(content);
        if (!parsed.version) {
          issues.push('latest.yml is missing "version" field.');
        } else if (targetVersion && parsed.version !== targetVersion) {
          issues.push(`latest.yml version mismatch: expected ${targetVersion}, found ${parsed.version}`);
        }
        if (!parsed.files || parsed.files.length === 0) {
          issues.push('latest.yml has no file entries.');
        } else {
          for (const fileEntry of parsed.files) {
            const binaryName = fileEntry.url;
            if (!fs.existsSync(path.join(root, binaryName))) {
              issues.push(`Binary referenced in latest.yml (${binaryName}) does not exist.`);
            }
          }
        }
        console.log(`  - latest.yml: ✅ VALID (version ${parsed.version})`);
      } catch (err) {
        issues.push(`Failed to parse latest.yml: ${err.message}`);
      }
    }
  }

  if (issues.length > 0) {
    console.error('\n❌ [UPDATER_VALIDATOR] Validation failed with errors:');
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    return false;
  }

  console.log('\n✅ [UPDATER_VALIDATOR] All update artifacts verified successfully!');
  return true;
}

if (require.main === module) {
  const dir = process.argv[2] || 'dist-desktop';
  const version = process.argv[3] || require('../package.json').version;
  const ok = validateUpdateArtifacts(dir, version);
  if (!ok) {
    process.exit(1);
  }
}

module.exports = {
  validateUpdateArtifacts,
};

