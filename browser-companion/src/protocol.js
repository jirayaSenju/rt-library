globalThis.RT_COMPANION_PROTOCOL_VERSION = 1;
globalThis.RT_COMPANION_API = '/v1';
globalThis.RT_COMPANION_MAX_BYTES = 10 * 1024 * 1024;

globalThis.isAllowedRuTrackerUrl = (value, type) => {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://rutracker.org' || !url.pathname.startsWith('/forum/')) return false;
    if (type === 'FETCH_CATEGORY') return url.pathname === '/forum/viewforum.php' && /^\d+$/.test(url.searchParams.get('f') || '');
    if (type === 'FETCH_TOPIC') return url.pathname === '/forum/viewtopic.php' && /^\d+$/.test(url.searchParams.get('t') || '');
    return false;
  } catch { return false; }
};
