const { shell: defaultShell } = require('electron');

/**
 * Strict allowlist of permitted external domains for Tools Hub
 */
const ALLOWED_HOSTS = new Set([
  'github.com',
  'edenprodkeys.com',
]);

/**
 * Central built-in tools registry
 */
const BUILTIN_TOOLS = {
  'nscb-desktop': {
    id: 'nscb-desktop',
    name: 'NSCB Desktop',
    url: 'https://github.com/cxfcxf/nscb-desktop',
  },
  'nx-firmware': {
    id: 'nx-firmware',
    name: 'NX Firmware',
    url: 'https://github.com/THZoria/NX_Firmware/releases',
  },
  'keys': {
    id: 'keys',
    name: 'Keys',
    url: 'https://edenprodkeys.com/',
  },
};

/**
 * Validates whether a target URL is secure and matches allowed criteria
 * @param {string} urlString
 * @returns {{ valid: boolean, error?: string, parsedUrl?: URL }}
 */
function validateToolUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'INVALID_URL' };
  }

  const trimmed = urlString.trim().toLowerCase();

  // Block dangerous pseudo-schemes and custom executable protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('shell:') ||
    trimmed.startsWith('cmd:') ||
    trimmed.startsWith('powershell:')
  ) {
    return { valid: false, error: 'DISALLOWED_PROTOCOL' };
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'MALFORMED_URL' };
  }

  // Strict HTTPS only
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'HTTPS_REQUIRED' };
  }

  // Allowlist hostname verification
  const hostname = parsed.hostname.toLowerCase();
  const isAllowedHost = Array.from(ALLOWED_HOSTS).some(
    (allowed) => hostname === allowed || hostname.endsWith('.' + allowed)
  );

  if (!isAllowedHost) {
    return { valid: false, error: 'HOST_NOT_ALLOWED' };
  }

  return { valid: true, parsedUrl: parsed };
}

/**
 * Registers Tools IPC handlers
 */
function registerToolsIPCHandlers(ipcMainInstance, shellInstance = defaultShell) {
  if (!ipcMainInstance || typeof ipcMainInstance.handle !== 'function') return;

  ipcMainInstance.handle('tools:open-external', async (event, payload) => {
    const toolId = typeof payload === 'string' ? payload : payload?.toolId;
    const requestedUrl = typeof payload === 'object' ? payload?.url : undefined;

    let targetUrl;
    let registeredTool;

    if (toolId) {
      registeredTool = BUILTIN_TOOLS[toolId];
      if (!registeredTool) {
        console.warn(`[TOOLS] Rejected unknown tool id=${toolId}`);
        return { success: false, error: 'UNKNOWN_TOOL' };
      }
      targetUrl = registeredTool.url;

      // If renderer passed a URL alongside toolId, it must match the canonical registered URL
      if (requestedUrl && requestedUrl !== targetUrl) {
        console.warn(`[TOOLS] URL mismatch for tool id=${toolId}`);
        return { success: false, error: 'URL_MISMATCH' };
      }
    } else if (requestedUrl) {
      targetUrl = requestedUrl;
    } else {
      return { success: false, error: 'MISSING_TARGET' };
    }

    const validation = validateToolUrl(targetUrl);
    if (!validation.valid) {
      console.warn(`[TOOLS] Blocked insecure URL: ${targetUrl} (${validation.error})`);
      return { success: false, error: validation.error };
    }

    try {
      console.log(`[TOOLS] opening external resource id=${toolId || 'custom'}`);
      await shellInstance.openExternal(targetUrl);
      return { success: true };
    } catch (err) {
      console.error('[TOOLS] Failed to open external URL:', err?.message || 'Unknown error');
      return { success: false, error: 'OPEN_FAILED' };
    }
  });

  ipcMainInstance.handle('tools:get-registry', () => {
    return Object.values(BUILTIN_TOOLS);
  });
}

module.exports = {
  registerToolsIPCHandlers,
  validateToolUrl,
  BUILTIN_TOOLS,
  ALLOWED_HOSTS,
};

