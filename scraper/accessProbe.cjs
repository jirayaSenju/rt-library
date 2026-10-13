const ACCESS_STATUSES = Object.freeze({
  ACCESSIBLE: 'ACCESSIBLE',
  ACCESSIBLE_EMPTY: 'ACCESSIBLE_EMPTY',
  INTERACTION_REQUIRED: 'INTERACTION_REQUIRED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  HTTP_ERROR: 'HTTP_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN',
});

function detectAccessChallenge({ status, cfMitigated, title = '', body = '' } = {}) {
  const challengeText = /just a moment|checking your browser|cf-browser-verification|challenge-platform|enable javascript and cookies|attention required|ddos-guard/i;
  return String(cfMitigated || '').toLowerCase() === 'challenge'
    || challengeText.test(`${title}\n${body}`);
}

function resolveProbeScope(categories = [], selectedCategoryId = null) {
  const enabled = categories.filter((category) => category.enabled !== false);
  if (!selectedCategoryId || selectedCategoryId === 'all') {
    return { type: 'all', categories: enabled, categoryIds: enabled.map((category) => category.id) };
  }
  const selected = enabled.find((category) => category.id.toLowerCase() === String(selectedCategoryId).toLowerCase());
  if (!selected) throw new Error(`CATEGORY_NOT_FOUND: Category "${selectedCategoryId}" is not enabled.`);
  return { type: 'single', categories: [selected], categoryIds: [selected.id] };
}

function classifyNetworkError(error) {
  const message = String(error?.message || error || 'Network request failed');
  if (/timeout|timed out/i.test(message)) return 'TIMEOUT';
  if (/ENOTFOUND|EAI_AGAIN|DNS/i.test(message)) return 'DNS_ERROR';
  if (/ECONNRESET|connection reset/i.test(message)) return 'CONNECTION_RESET';
  if (/ERR_INTERNET_DISCONNECTED|offline|ENETUNREACH/i.test(message)) return 'OFFLINE';
  return 'NETWORK_ERROR';
}

function sanitizeUrlForLog(value, base) {
  try {
    const url = new URL(value, base);
    const catId = url.searchParams.get('f');
    return `${url.origin}${url.pathname}${catId ? `?f=${catId}` : ''}`;
  } catch (_) {
    return '[invalid-url]';
  }
}

function classifyCategoryAccess({
  category,
  status,
  cfMitigated,
  finalUrl,
  title = '',
  body = '',
  topicCount = 0,
  hasForumStructure = false,
  challengePresent = false,
  error,
  checkedAt = new Date().toISOString(),
} = {}) {
  const url = category?.baseUrl || '';
  const base = {
    categoryId: category?.id || null,
    categoryName: category?.name || category?.id || 'Unknown category',
    url,
    status: ACCESS_STATUSES.UNKNOWN,
    httpStatus: Number.isFinite(status) ? status : null,
    challengeDetected: false,
    authenticationRequired: false,
    interactionRequired: false,
    challengeType: null,
    reason: 'unknown',
    errorType: null,
    checkedAt,
    message: '',
    topicCount: Number(topicCount) || 0,
  };

  if (error) {
    return {
      ...base,
      status: ACCESS_STATUSES.NETWORK_ERROR,
      errorType: classifyNetworkError(error),
      message: String(error.message || error).slice(0, 240),
    };
  }

  const challengeDetected = challengePresent || detectAccessChallenge({ status, cfMitigated, title, body });
  if (challengeDetected) {
    return {
      ...base,
      status: ACCESS_STATUSES.INTERACTION_REQUIRED,
      challengeDetected: true,
      challengeType: 'cloudflare_challenge',
      interactionRequired: true,
      reason: 'cloudflare_challenge',
      message: `RuTracker requires browser verification for ${base.categoryName}.`,
    };
  }

  if (Number(status) === 401 || Number(status) === 403
    || /login\.php/i.test(finalUrl || '')
    || /authenticationRequired/.test(body)) {
    return {
      ...base,
      status: ACCESS_STATUSES.AUTH_REQUIRED,
      authenticationRequired: true,
      interactionRequired: false,
      reason: 'authentication_required',
      message: `RuTracker requires an authenticated session for ${base.categoryName}.`,
    };
  }

  if (Number(status) >= 400) {
    return { ...base, status: ACCESS_STATUSES.HTTP_ERROR, message: `RuTracker returned HTTP ${status}.` };
  }

  if (!Number(status)) {
    return { ...base, status: ACCESS_STATUSES.NETWORK_ERROR, errorType: 'NETWORK_ERROR', message: 'The current page has no successful forum response yet.' };
  }

  if (Number(status) >= 200 && Number(status) < 300 && hasForumStructure) {
    const accessibleEmpty = Number(topicCount) === 0;
    return {
      ...base,
      status: accessibleEmpty ? ACCESS_STATUSES.ACCESSIBLE_EMPTY : ACCESS_STATUSES.ACCESSIBLE,
      message: accessibleEmpty ? 'The forum is accessible and currently has no visible topics.' : 'The category is accessible.',
    };
  }

  return { ...base, message: 'The response did not match a RuTracker forum listing.' };
}

async function probeCategory(page, category, { timeout = 25000, navigate = null } = {}) {
  let response;
  try {
    response = await (navigate || page.goto.bind(page))(category.baseUrl, { waitUntil: 'domcontentloaded', timeout });
    const status = response?.status() || 0;
    const headers = response?.headers() || {};
    const pageInfo = await page.evaluate(() => ({
      title: document.title || '',
      body: (document.body?.innerText || '').slice(0, 4000),
      topicCount: document.querySelectorAll('a.torTopic, a.tt-text, a[href*="viewtopic.php?t="]').length,
      authenticationRequired: !!document.querySelector('form[action*="login"], form#login, input[name="login_username"]'),
      hasForumStructure: !!(
        document.querySelector('#tor-tbl, #forum_main, #page_container, #page_header')
        || document.querySelector('a[href*="viewtopic.php?t="]')
      ),
    }));

    return classifyCategoryAccess({
      category,
      status,
      cfMitigated: headers['cf-mitigated'],
      finalUrl: page.url(),
      ...pageInfo,
      body: pageInfo.authenticationRequired ? 'authenticationRequired' : pageInfo.body,
    });
  } catch (error) {
    return classifyCategoryAccess({ category, error });
  }
}

async function inspectCurrentCategory(page, category, responseInfo = {}) {
  try {
    const pageInfo = await page.evaluate(() => ({
      title: document.title || '',
      body: (document.body?.innerText || '').slice(0, 4000),
      topicCount: document.querySelectorAll('a.torTopic, a.tt-text, a[href*="viewtopic.php?t="]').length,
      authenticationRequired: !!document.querySelector('form[action*="login"], form#login, input[name="login_username"]'),
      hasForumStructure: !!(document.querySelector('#tor-tbl, #forum_main, #page_container, #page_header')
        || document.querySelector('a[href*="viewtopic.php?t="]')),
      challengeElement: !!document.querySelector('#challenge-form, .cf-challenge, [id^="cf-chl-"]'),
    }));
    const currentUrl = page.url();
    const expected = new URL(category.baseUrl);
    const actual = new URL(currentUrl);
    const categoryMatches = actual.origin === expected.origin
      && actual.pathname === expected.pathname
      && actual.searchParams.get('f') === expected.searchParams.get('f');
    return classifyCategoryAccess({
      category,
      status: responseInfo.status,
      cfMitigated: responseInfo.cfMitigated,
      finalUrl: currentUrl,
      ...pageInfo,
      hasForumStructure: pageInfo.hasForumStructure && categoryMatches,
      challengePresent: pageInfo.challengeElement || /\/cdn-cgi\/challenge-platform\//i.test(currentUrl),
      body: pageInfo.authenticationRequired ? 'authenticationRequired' : pageInfo.body,
    });
  } catch (error) {
    return classifyCategoryAccess({ category, error });
  }
}

function summarizeAccess(results, expectedCount = results.length) {
  const accessibleCount = results.filter((item) => [ACCESS_STATUSES.ACCESSIBLE, ACCESS_STATUSES.ACCESSIBLE_EMPTY].includes(item.status)).length;
  const allAccessible = expectedCount > 0 && results.length === expectedCount && accessibleCount === expectedCount;
  const hasInteraction = results.some((item) => item.status === ACCESS_STATUSES.INTERACTION_REQUIRED);
  const hasAuth = results.some((item) => item.status === ACCESS_STATUSES.AUTH_REQUIRED);
  const hasNetwork = results.some((item) => item.status === ACCESS_STATUSES.NETWORK_ERROR);
  const hasHttpError = results.some((item) => item.status === ACCESS_STATUSES.HTTP_ERROR);
  let status = 'UNKNOWN';
  if (allAccessible) status = 'READY';
  else if (hasInteraction) status = 'INTERACTION_REQUIRED';
  else if (hasAuth) status = 'AUTH_REQUIRED';
  else if (accessibleCount > 0) status = 'PARTIALLY_READY';
  else if (hasNetwork) status = 'NETWORK_ERROR';
  else if (hasHttpError) status = 'ERROR';
  return { status, scanReady: allAccessible, accessibleCount, expectedCount, results };
}

module.exports = { ACCESS_STATUSES, detectAccessChallenge, classifyNetworkError, sanitizeUrlForLog, classifyCategoryAccess, probeCategory, inspectCurrentCategory, resolveProbeScope, summarizeAccess };
