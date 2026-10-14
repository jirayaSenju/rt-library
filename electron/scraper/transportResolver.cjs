/**
 * Scraper Transport Resolver (V3-82)
 *
 * Resolves active transport according to policy:
 * - When EMBEDDED is promoted (or selected):
 *   1. EMBEDDED_ELECTRON (Built-in Scraper)
 *   2. BROWSER_COMPANION (if connected/available fallback)
 *   3. PLAYWRIGHT
 *   4. MANUAL_IMPORT
 * - When EMBEDDED is not promoted (legacy/experimental):
 *   1. BROWSER_COMPANION (if connected/available)
 *   2. PLAYWRIGHT (if available / fallback)
 *   3. MANUAL_IMPORT
 *   4. EMBEDDED_ELECTRON (experimental)
 * - Explicit preference is strictly honored; no secret mid-run switching.
 */

const appStateRepo = require('../database/repositories/appStateRepo.cjs');

const TRANSPORTS = Object.freeze({
  AUTOMATIC: 'AUTOMATIC',
  EMBEDDED_ELECTRON: 'EMBEDDED_ELECTRON',
  BROWSER_COMPANION: 'BROWSER_COMPANION',
  PLAYWRIGHT: 'PLAYWRIGHT',
  MANUAL_IMPORT: 'MANUAL_IMPORT',
  NONE: 'NONE',
});

const APP_STATE_TRANSPORT_PREFERENCE = 'scraper_transport_preference';
const APP_STATE_EMBEDDED_PROMOTED = 'scraper_embedded_promoted';

function getTransportPreference(db) {
  if (!db) return TRANSPORTS.AUTOMATIC;
  try {
    const pref = appStateRepo.getAppState(db, APP_STATE_TRANSPORT_PREFERENCE);
    if (pref && Object.values(TRANSPORTS).includes(pref)) {
      return pref;
    }
  } catch (_) {}
  return TRANSPORTS.AUTOMATIC;
}

function setTransportPreference(db, preference) {
  if (!db) return false;
  const valid = Object.values(TRANSPORTS).includes(preference) ? preference : TRANSPORTS.AUTOMATIC;
  try {
    appStateRepo.setAppState(db, APP_STATE_TRANSPORT_PREFERENCE, valid);
    return true;
  } catch (err) {
    console.error('[TRANSPORT] Failed to save transport preference:', err.message);
    return false;
  }
}

function isEmbeddedPromoted(db) {
  if (!db) return false;
  try {
    const val = appStateRepo.getAppState(db, APP_STATE_EMBEDDED_PROMOTED);
    return val === 'true';
  } catch (_) {}
  return false;
}

function setEmbeddedPromoted(db, isPromoted) {
  if (!db) return false;
  try {
    appStateRepo.setAppState(db, APP_STATE_EMBEDDED_PROMOTED, isPromoted ? 'true' : 'false');
    return true;
  } catch (err) {
    console.error('[TRANSPORT] Failed to set embedded promotion state:', err.message);
    return false;
  }
}

function resolveActiveTransport({
  companionTransport,
  embeddedTransport,
  preferredTransport,
  promotionPolicy,
} = {}) {
  // Explicit non-automatic preference
  if (preferredTransport && preferredTransport !== TRANSPORTS.AUTOMATIC && Object.values(TRANSPORTS).includes(preferredTransport)) {
    if (preferredTransport === TRANSPORTS.BROWSER_COMPANION) {
      if (companionTransport?.isAvailable()) return TRANSPORTS.BROWSER_COMPANION;
      return TRANSPORTS.PLAYWRIGHT; // Fallback when companion explicitly preferred but not connected
    }
    return preferredTransport;
  }

  const isPromoted = promotionPolicy === 'PROMOTED' || promotionPolicy === true;

  // Promoted Automatic Resolution
  if (isPromoted) {
    if (!embeddedTransport || embeddedTransport.isAvailable?.() !== false) {
      return TRANSPORTS.EMBEDDED_ELECTRON;
    }
    if (companionTransport?.isAvailable()) {
      return TRANSPORTS.BROWSER_COMPANION;
    }
    return TRANSPORTS.PLAYWRIGHT;
  }

  // Experimental / Unpromoted Automatic Resolution (Companion first)
  if (companionTransport?.isAvailable()) {
    return TRANSPORTS.BROWSER_COMPANION;
  }

  return TRANSPORTS.PLAYWRIGHT;
}

function getAvailableTransports({ companionTransport, includeExperimental = false, isPromoted = false } = {}) {
  const available = [];

  if (isPromoted) {
    available.push({
      id: TRANSPORTS.EMBEDDED_ELECTRON,
      name: 'Built-in Scraper',
      isPrimary: true,
      ready: true,
      experimental: false,
    });
    if (companionTransport?.isAvailable()) {
      available.push({
        id: TRANSPORTS.BROWSER_COMPANION,
        name: 'Browser Companion',
        isPrimary: false,
        isFallback: true,
        ready: true,
      });
    }
    available.push({
      id: TRANSPORTS.PLAYWRIGHT,
      name: 'Playwright (Direct Scraper)',
      isPrimary: false,
      ready: true,
    });
    available.push({
      id: TRANSPORTS.MANUAL_IMPORT,
      name: 'Manual HTML Import',
      isPrimary: false,
      ready: true,
    });
    return available;
  }

  if (companionTransport?.isAvailable()) {
    available.push({
      id: TRANSPORTS.BROWSER_COMPANION,
      name: 'Browser Companion',
      isPrimary: true,
      ready: true,
    });
  }
  available.push({
    id: TRANSPORTS.PLAYWRIGHT,
    name: 'Playwright (Direct Scraper)',
    isPrimary: false,
    ready: true,
  });
  available.push({
    id: TRANSPORTS.MANUAL_IMPORT,
    name: 'Manual HTML Import',
    isPrimary: false,
    ready: true,
  });
  if (includeExperimental) {
    available.push({
      id: TRANSPORTS.EMBEDDED_ELECTRON,
      name: 'Embedded Electron (Experimental)',
      isPrimary: false,
      ready: true,
      experimental: true,
    });
  }
  return available;
}

module.exports = {
  TRANSPORTS,
  APP_STATE_TRANSPORT_PREFERENCE,
  APP_STATE_EMBEDDED_PROMOTED,
  getTransportPreference,
  setTransportPreference,
  isEmbeddedPromoted,
  setEmbeddedPromoted,
  resolveActiveTransport,
  getAvailableTransports,
};
