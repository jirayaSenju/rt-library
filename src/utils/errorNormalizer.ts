/**
 * RT-Library IPC & Runtime Error Normalization Utility
 * Sanitizes internal stack traces, filesystem paths, and module details,
 * producing clean user-facing error contracts with technical diagnostics preserved.
 */

export interface NormalizedError {
  code: string;
  category: 'RUNTIME' | 'NETWORK' | 'AUTH' | 'GENERAL';
  userMessage: string;
  secondaryMessage?: string;
  recoverable: boolean;
  actions: ('RETRY' | 'USE_COMPANION' | 'VIEW_DIAGNOSTICS')[];
  technicalDetails?: string;
}

/**
 * Sanitizes raw error strings by stripping absolute paths (Windows/POSIX),
 * stack traces, internal Electron IPC prefixes, and internal module names.
 */
export function sanitizeErrorMessage(rawMessage: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'Something went wrong while starting the scraper.';
  }

  // Check for missing module / runtime dependency
  if (
    rawMessage.includes('Cannot find module') ||
    rawMessage.includes('MODULE_NOT_FOUND') ||
    rawMessage.includes('SCRAPER_RUNTIME_DEPENDENCY_MISSING') ||
    rawMessage.includes('RUNTIME_DEPENDENCY_MISSING')
  ) {
    return 'Built-in Scraper could not start. A required component is missing from this installation.';
  }

  // Strip Electron IPC prefix
  let clean = rawMessage.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, '');

  // Strip stack trace: Require stack: ... or at ...
  clean = clean.split(/\r?\n\s*Require stack:/i)[0];
  clean = clean.split(/\r?\n\s*at\s+/i)[0];

  // Strip Windows absolute paths like C:\Users\... or C:/Users/...
  clean = clean.replace(/[a-zA-Z]:\\[^:<>"|\r\n]+/g, '[path]');
  clean = clean.replace(/[a-zA-Z]:\/[^:<>"|\r\n]+/g, '[path]');

  // Strip Unix absolute paths like /home/... or /usr/...
  clean = clean.replace(/(\/(home|Users|usr|app|var)\/[^:<>"|\r\n\s]+)/g, '[path]');
  clean = clean.replace(/resources\/app\.asar[^\s]*/g, '[app]');

  // Strip internal module identifiers from normal user display
  clean = clean.replace(/\bjsdom\b/gi, 'required component');

  clean = clean.trim();
  if (!clean || clean === '[path]' || clean === 'Error' || clean.length > 250) {
    return 'Something went wrong while starting the scraper.';
  }

  return clean;
}

/**
 * Normalizes any IPC or runtime error into a structured NormalizedError contract.
 */
export function normalizeIpcError(rawError: unknown): NormalizedError {
  // If already a structured NormalizedError
  if (
    rawError &&
    typeof rawError === 'object' &&
    'code' in rawError &&
    'userMessage' in rawError &&
    'category' in rawError
  ) {
    return rawError as NormalizedError;
  }

  const rawMessage =
    rawError instanceof Error
      ? rawError.message
      : typeof rawError === 'string'
      ? rawError
      : rawError && typeof rawError === 'object' && 'message' in rawError
      ? String((rawError as any).message)
      : String(rawError || '');

  const rawStack =
    rawError instanceof Error
      ? rawError.stack
      : rawError && typeof rawError === 'object' && 'stack' in rawError
      ? String((rawError as any).stack)
      : rawMessage;

  const isMissingModule =
    rawMessage.includes('Cannot find module') ||
    rawMessage.includes('MODULE_NOT_FOUND') ||
    rawMessage.includes('SCRAPER_RUNTIME_DEPENDENCY_MISSING') ||
    rawMessage.includes('RUNTIME_DEPENDENCY_MISSING');

  if (isMissingModule) {
    return {
      code: 'SCRAPER_RUNTIME_DEPENDENCY_MISSING',
      category: 'RUNTIME',
      userMessage: 'Built-in Scraper could not start.',
      secondaryMessage: 'A required component is missing from this installation.',
      recoverable: false,
      actions: ['RETRY', 'USE_COMPANION', 'VIEW_DIAGNOSTICS'],
      technicalDetails: rawStack || rawMessage,
    };
  }

  const isNetwork =
    rawMessage.includes('ETIMEDOUT') ||
    rawMessage.includes('ECONNREFUSED') ||
    rawMessage.includes('ENOTFOUND') ||
    rawMessage.includes('Network timeout');

  if (isNetwork) {
    return {
      code: 'SCRAPER_NETWORK_ERROR',
      category: 'NETWORK',
      userMessage: 'Connection to RuTracker timed out or was refused.',
      secondaryMessage: 'Check your internet connection or proxy settings.',
      recoverable: true,
      actions: ['RETRY', 'USE_COMPANION', 'VIEW_DIAGNOSTICS'],
      technicalDetails: rawStack || rawMessage,
    };
  }

  const isAuth =
    rawMessage.includes('CHALLENGE_REQUIRED') ||
    rawMessage.includes('Cloudflare') ||
    rawMessage.includes('VERIFICATION_REQUIRED');

  if (isAuth) {
    return {
      code: 'SCRAPER_VERIFICATION_REQUIRED',
      category: 'AUTH',
      userMessage: 'RuTracker verification required.',
      secondaryMessage: 'Complete the verification challenge in the popup window.',
      recoverable: true,
      actions: ['RETRY', 'VIEW_DIAGNOSTICS'],
      technicalDetails: rawStack || rawMessage,
    };
  }

  const sanitized = sanitizeErrorMessage(rawMessage);

  return {
    code: 'SCRAPER_UNKNOWN_ERROR',
    category: 'GENERAL',
    userMessage: sanitized,
    recoverable: true,
    actions: ['RETRY', 'VIEW_DIAGNOSTICS'],
    technicalDetails: rawStack || rawMessage,
  };
}

