import { describe, it, expect } from 'vitest';
import { validateReleaseVersion, STRICT_SEMVER_REGEX, STRICT_TAG_REGEX } from '../../scripts/validate-release-version.cjs';

describe('V3-38 Release & Strict SemVer Validation Suite', () => {
  it('validates strict SemVer patterns correctly (MAJOR.MINOR.PATCH with no prerelease/leading zeros)', () => {
    expect(STRICT_SEMVER_REGEX.test('1.0.0')).toBe(true);
    expect(STRICT_SEMVER_REGEX.test('1.1.0')).toBe(true);
    expect(STRICT_SEMVER_REGEX.test('2.0.1')).toBe(true);
    expect(STRICT_SEMVER_REGEX.test('0.1.0')).toBe(true);

    // Rejected patterns
    expect(STRICT_SEMVER_REGEX.test('2.0.1-beta.1')).toBe(false);
    expect(STRICT_SEMVER_REGEX.test('1.0.0-rc.2')).toBe(false);
    expect(STRICT_SEMVER_REGEX.test('v1.0.0')).toBe(false);
    expect(STRICT_SEMVER_REGEX.test('1.0')).toBe(false);
    expect(STRICT_SEMVER_REGEX.test('1.0.0.0')).toBe(false);
    expect(STRICT_SEMVER_REGEX.test('01.0.0')).toBe(false);
    expect(STRICT_SEMVER_REGEX.test('invalid-version')).toBe(false);
  });

  it('validates strict Git tag patterns correctly (vMAJOR.MINOR.PATCH)', () => {
    expect(STRICT_TAG_REGEX.test('v1.0.0')).toBe(true);
    expect(STRICT_TAG_REGEX.test('v1.1.0')).toBe(true);
    expect(STRICT_TAG_REGEX.test('v2.0.1')).toBe(true);
    expect(STRICT_TAG_REGEX.test('v0.1.0')).toBe(true);

    // Rejected patterns
    expect(STRICT_TAG_REGEX.test('1.0.0')).toBe(false);
    expect(STRICT_TAG_REGEX.test('v1.0')).toBe(false);
    expect(STRICT_TAG_REGEX.test('v1.0.0-beta.1')).toBe(false);
    expect(STRICT_TAG_REGEX.test('v1.0.0.0')).toBe(false);
    expect(STRICT_TAG_REGEX.test('v01.0.0')).toBe(false);
  });

  it('validates current repository release readiness for v1.0.0', () => {
    const result = validateReleaseVersion('v1.0.0');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.info.pkgVersion).toBe('1.0.0');
    expect(result.info.lockVersion).toBe('1.0.0');
    expect(result.info.license).toBe('MIT');
    expect(result.info.changelogEntryFound).toBe(true);
    expect(result.info.licenseFileFound).toBe(true);
  });

  it('detects mismatched release tag and package version', () => {
    const result = validateReleaseVersion('v2.5.0');
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue: string) => issue.includes('does not match package.json version'))).toBe(true);
  });

  it('detects tag missing leading "v" prefix', () => {
    const result = validateReleaseVersion('1.0.0');
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue: string) => issue.includes('must strictly match "vMAJOR.MINOR.PATCH"'))).toBe(true);
  });

  it('rejects prerelease tag formats', () => {
    const result = validateReleaseVersion('v1.0.0-beta.1');
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue: string) => issue.includes('Prerelease tags (alpha/beta/rc) are not supported'))).toBe(true);
  });
});

