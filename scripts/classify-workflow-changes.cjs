#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function changedPaths(base, head) {
  const zeroSha = /^0+$/.test(base || '');
  if (zeroSha || !base) {
    const parent = git(['rev-parse', `${head}^`]);
    base = parent;
  }
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function isDocsOrGenerated(file) {
  return /^(?:\.github\/|docs\/|benchmark-results\/|scratch\/|dist\/|dist-desktop\/)/.test(file)
    || /(?:^|\/)README\.md$/i.test(file)
    || /\.md$/i.test(file)
    || /^(?:CHANGELOG\.md|CONTRIBUTING\.md|SECURITY\.md|LEGAL\.md|LICENSE(?:\..*)?|THIRD_PARTY_.*)$/i.test(file);
}

function isTestOnly(file) {
  return /^(?:tests\/|__tests__\/|scripts\/test-)/.test(file)
    || /\.(?:test|spec)\.[^.]+$/i.test(file);
}

function isApplicationCode(file) {
  return !isDocsOrGenerated(file) && !isTestOnly(file);
}

function classifyPaths(files) {
  const isDesktopPath = (file) => /^(?:src\/|electron\/|scraper\/|public\/)/.test(file);
  const desktopChanged = files.some((file) => isDesktopPath(file)
    || /^(?:console\.js|index\.html|package\.json|package-lock\.json|tailwind\.config\.js|postcss\.config\.js|vite\.config\.[^/]+|electron-builder(?:\.[^/]*)?)$/.test(file)
    || /^scripts\/(?:package-|verify-package|generate-portable-metadata|validate-update-artifacts)/.test(file));
  const companionChanged = files.some((file) => /^browser-companion\//.test(file)
    || /^(?:package\.json|package-lock\.json)$/.test(file)
    || /^scripts\/(?:build-browser-companion|validate-companion-build|package-browser-companion)/.test(file));
  const packageSensitive = files.some((file) => /^electron\//.test(file)
    || /^(?:package\.json|package-lock\.json|electron-builder(?:\.[^/]*)?)$/.test(file)
    || /^scripts\/(?:package-|verify-package|generate-portable-metadata|validate-update-artifacts)/.test(file)
    || /^\.github\/workflows\/release\.ya?ml$/.test(file));
  const updaterChanged = files.some((file) => /^electron\/updater\//.test(file)
    || /^scripts\/validate-update-artifacts\.cjs$/.test(file)
    || /^\.github\/workflows\/release\.ya?ml$/.test(file));
  const applicationCodeChanged = files.some(isApplicationCode);
  const nonCodeOnly = files.length > 0 && !applicationCodeChanged;

  return {
    desktop_changed: desktopChanged,
    companion_changed: companionChanged,
    package_sensitive: packageSensitive,
    updater_changed: updaterChanged,
    non_runtime_only: nonCodeOnly,
    changed_paths_count: files.length,
  };
}

function eligibleReleaseCommit(commit) {
  const subject = git(['show', '-s', '--format=%s', commit]);
  const body = git(['show', '-s', '--format=%b', commit]);
  const paths = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commit], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  if (!paths.some(isApplicationCode)) return false;

  const releaseType = /^(?:feat|fix|perf|revert)(?:\([^)]*\))?:\s+/.test(subject);
  const breakingType = /^([a-zA-Z0-9_-]+)(?:\([^)]*\))?!:\s+/.exec(subject);
  const conventional = /^([a-zA-Z0-9_-]+)(?:\([^)]*\))?:\s+/.exec(subject);
  const footerBreaking = conventional
    && !/^docs$/i.test(conventional[1])
    && /^BREAKING[ -]CHANGE:/m.test(body);
  return releaseType || (breakingType && !/^docs$/i.test(breakingType[1])) || footerBreaking;
}

function hasReleaseCandidate(target) {
  const previousTag = (() => {
    try {
      return git(['describe', '--tags', '--match', 'v[0-9]*.[0-9]*.[0-9]*', '--abbrev=0', `${target}^`]);
    } catch {
      return '';
    }
  })();
  const range = previousTag ? `${previousTag}..${target}` : target;
  const commits = git(['rev-list', range]).split('\n').filter(Boolean);
  return commits.some(eligibleReleaseCommit);
}

function writeOutputs(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) require('node:fs').appendFileSync(process.env.GITHUB_OUTPUT, lines);
  process.stdout.write(lines);
}

function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'release') {
    const [target] = args;
    if (!target) throw new Error('Usage: classify-workflow-changes.cjs release <target-sha>');
    process.stdout.write(`release_candidate=${hasReleaseCandidate(target)}\n`);
    return;
  }

  const [base, head, eventName] = mode === 'diff' ? args : process.argv.slice(2);
  if (!base || !head) throw new Error('Usage: classify-workflow-changes.cjs <base-sha> <head-sha> [event-name]');
  const files = changedPaths(base, head);
  const result = classifyPaths(files);
  result.release_candidate = eventName === 'push' && hasReleaseCandidate(head);
  writeOutputs(result);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Workflow change classification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { classifyPaths, isApplicationCode, hasReleaseCandidate, eligibleReleaseCommit };
