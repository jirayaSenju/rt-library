/**
 * Theme Contrast & Readability Audit Script (V3-25)
 * Calculates WCAG 2.1 relative luminance and contrast ratio for all theme tokens.
 */

const fs = require('fs');
const path = require('path');

function parseThemesFromSource() {
  const fileContent = fs.readFileSync(
    path.join(__dirname, '../src/theme/themes.ts'),
    'utf-8'
  );

  const startMarker = 'export const THEMES: Record<ThemeId, AppTheme> = {';
  const endMarker = '\nexport const DEFAULT_THEME_ID';
  const startIndex = fileContent.indexOf(startMarker);
  const endIndex = fileContent.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Could not slice THEMES object in themes.ts');
  }

  const rawObj = fileContent.slice(startIndex + startMarker.length - 1, endIndex).trim();
  const fn = new Function(`return ${rawObj};`);
  return fn();
}

function hexToRgb(hex) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function relativeLuminance(rgb) {
  const sRGB = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const linear = sRGB.map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function auditThemes() {
  const themes = parseThemesFromSource();
  const results = {};
  let totalChecks = 0;
  let failures = 0;

  console.log('=== RT-LIBRARY THEME READABILITY & CONTRAST AUDIT (WCAG AA) ===\n');

  for (const [themeId, theme] of Object.entries(themes)) {
    console.log(`\n--- Theme: ${theme.name} (${themeId}) [${theme.type}] ---`);
    const c = theme.colors;

    const pairs = [
      { name: 'foreground / background', fg: c.foreground, bg: c.background, min: 4.5 },
      { name: 'cardForeground / card', fg: c.cardForeground, bg: c.card, min: 4.5 },
      { name: 'popoverForeground / popover', fg: c.popoverForeground, bg: c.popover, min: 4.5 },
      { name: 'primaryForeground / primary', fg: c.primaryForeground, bg: c.primary, min: 4.5 },
      { name: 'secondaryForeground / secondary', fg: c.secondaryForeground, bg: c.secondary, min: 4.5 },
      { name: 'accentForeground / accent', fg: c.accentForeground, bg: c.accent, min: 4.5 },
      { name: 'destructiveForeground / destructive', fg: c.destructiveForeground, bg: c.destructive, min: 4.5 },
      { name: 'mutedForeground / background', fg: c.mutedForeground, bg: c.background, min: 4.5 },
      { name: 'mutedForeground / card', fg: c.mutedForeground, bg: c.card, min: 4.5 },
    ];

    results[themeId] = [];

    for (const pair of pairs) {
      totalChecks++;
      const ratio = contrastRatio(pair.fg, pair.bg);
      const passed = ratio >= pair.min;
      if (!passed) failures++;

      const status = passed ? 'PASS' : 'FAIL';
      console.log(`  ${pair.name.padEnd(36)}: ${ratio.toFixed(2).padStart(5)}:1  [${status}] (min ${pair.min}:1)`);
      results[themeId].push({ ...pair, ratio, passed });
    }
  }

  console.log(`\n=== AUDIT SUMMARY ===`);
  console.log(`Themes audited: ${Object.keys(themes).length}`);
  console.log(`Total checks:   ${totalChecks}`);
  console.log(`Failures:       ${failures}`);

  return { themes, results, failures };
}

if (require.main === module) {
  const { failures } = auditThemes();
  if (failures > 0) {
    process.exit(1);
  }
}

module.exports = {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  parseThemesFromSource,
  auditThemes,
};

