/**
 * Magnet URL Parser & BTIH Normalizer
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32ToHex(base32Str) {
  if (!base32Str || typeof base32Str !== 'string') return null;
  const clean = base32Str.toUpperCase().replace(/=/g, '');
  if (clean.length !== 32) return null;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean.charAt(i));
    if (val === -1) return null;
    bits += val.toString(2).padStart(5, '0');
  }

  let hex = '';
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const byte = parseInt(bits.substring(i, i + 8), 2);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex.toLowerCase();
}

function parseMagnetUrl(magnetUrl) {
  if (!magnetUrl || typeof magnetUrl !== 'string') {
    return { isValid: false, error: 'Magnet URL must be a non-empty string' };
  }

  const trimmed = magnetUrl.trim();
  if (!trimmed.startsWith('magnet:?')) {
    return { isValid: false, error: 'Invalid magnet protocol prefix' };
  }

  const queryStr = trimmed.substring('magnet:?'.length);
  const params = new URLSearchParams(queryStr);

  const xtList = params.getAll('xt');
  let btih = null;

  for (const xt of xtList) {
    if (xt.startsWith('urn:btih:')) {
      btih = xt.substring('urn:btih:'.length);
      break;
    }
  }

  if (!btih) {
    return { isValid: false, error: 'Missing BTIH infoHash parameter in magnet URL' };
  }

  let normalizedInfoHash = null;
  const cleanBtih = btih.split('&')[0].trim();

  // 40 hex chars
  if (/^[a-fA-F0-9]{40}$/.test(cleanBtih)) {
    normalizedInfoHash = cleanBtih.toLowerCase();
  }
  // 32 base32 chars
  else if (/^[a-zA-Z2-7]{32}$/.test(cleanBtih)) {
    normalizedInfoHash = base32ToHex(cleanBtih);
  }

  if (!normalizedInfoHash) {
    return { isValid: false, error: `Invalid BTIH format: ${cleanBtih}` };
  }

  const displayName = params.get('dn') ? decodeURIComponent(params.get('dn')) : null;
  const rawTrackers = params.getAll('tr');
  const trackers = Array.from(
    new Set(
      rawTrackers
        .map((tr) => {
          try {
            return decodeURIComponent(tr).trim();
          } catch {
            return tr.trim();
          }
        })
        .filter((tr) => tr.length > 0)
    )
  );

  return {
    isValid: true,
    infoHash: normalizedInfoHash,
    displayName,
    trackers,
    rawMagnet: trimmed,
  };
}

module.exports = {
  parseMagnetUrl,
  base32ToHex,
};
