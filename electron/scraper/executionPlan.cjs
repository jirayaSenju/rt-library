/**
 * Scraper Execution Plan & Semantics Manager
 * Centralizes the execution contract for Incremental, Full Scan, and Refresh modes,
 * enforcing strict separation between Execution SCOPE and Execution MODE.
 */

function resolveExecutionScope({ category, enabledCategories = [], allCategories = [] } = {}) {
  const selected = (category && typeof category === 'string') ? category.trim() : null;

  if (!selected || selected === 'all') {
    const activeCategories = Array.isArray(enabledCategories) && enabledCategories.length > 0
      ? enabledCategories
      : (Array.isArray(allCategories) ? allCategories.filter((c) => c.enabled !== false) : []);

    return {
      type: 'all',
      targetCategoryId: null,
      categoryIds: activeCategories.map((c) => (typeof c === 'string' ? c : c.id)),
      categories: activeCategories,
    };
  }

  // Validate single category
  const targetId = selected.toLowerCase();
  const searchPool = Array.isArray(allCategories) && allCategories.length > 0
    ? allCategories
    : (Array.isArray(enabledCategories) ? enabledCategories : []);

  const found = searchPool.find((c) => (typeof c === 'string' ? c.toLowerCase() : c.id.toLowerCase()) === targetId);

  if (!found) {
    if (searchPool.length > 0) {
      throw new Error(`CATEGORY_NOT_FOUND: Category "${selected}" does not exist.`);
    }
    // Fallback when no pool provided (e.g. unit tests without explicit category lists)
    return {
      type: 'single',
      targetCategoryId: targetId,
      categoryIds: [targetId],
      categories: [{ id: targetId, name: targetId, enabled: true }],
    };
  }

  if (typeof found === 'object' && found.enabled === false) {
    throw new Error(`CATEGORY_DISABLED: Selected category "${found.name || targetId}" is disabled.`);
  }

  const categoryObj = typeof found === 'object' ? found : { id: targetId, name: targetId, enabled: true };

  return {
    type: 'single',
    targetCategoryId: targetId,
    categoryIds: [targetId],
    categories: [categoryObj],
  };
}

function normalizeScraperOptions(userOptions = {}) {
  const isFull = Boolean(userOptions.full || userOptions.mode === 'full');
  const isRefreshScreenshots = Boolean(userOptions.refreshScreenshots || userOptions.refreshScreenshotsAndCovers || userOptions.mode === 'refresh_screenshots');
  const isRefreshSizes = Boolean(userOptions.refreshSizes || userOptions.refreshItemSize || userOptions.mode === 'refresh_sizes');
  const isRefreshFiles = Boolean(userOptions.refreshFiles || userOptions.refreshFileList || userOptions.mode === 'refresh_files');

  // Strip non-serializable properties (e.g. functions)
  const cleanOptions = {};
  for (const key of Object.keys(userOptions)) {
    if (typeof userOptions[key] !== 'function') {
      cleanOptions[key] = userOptions[key];
    }
  }

  const category = (userOptions.category && userOptions.category !== 'all')
    ? userOptions.category
    : (userOptions.category === 'all' ? 'all' : null);

  if (isFull) {
    return {
      ...cleanOptions,
      category,
      full: true,
      mode: 'full',
      refreshScreenshots: true,
      refreshSizes: true,
      refreshFiles: true,
    };
  }

  const isRefresh = isRefreshScreenshots || isRefreshSizes || isRefreshFiles || (typeof userOptions.mode === 'string' && userOptions.mode.startsWith('refresh'));

  if (isRefresh) {
    return {
      ...cleanOptions,
      category,
      full: false,
      mode: 'refresh',
      refreshScreenshots: isRefreshScreenshots,
      refreshSizes: isRefreshSizes,
      refreshFiles: isRefreshFiles,
    };
  }

  return {
    ...cleanOptions,
    category,
    full: false,
    mode: userOptions.mode || 'incremental',
    refreshScreenshots: false,
    refreshSizes: false,
    refreshFiles: false,
  };
}

function createExecutionPlan(userOptions = {}, categoryContext = {}) {
  const normalized = normalizeScraperOptions(userOptions);
  const isFull = normalized.full;
  const isRefresh = normalized.mode === 'refresh';

  const scope = resolveExecutionScope({
    category: normalized.category,
    enabledCategories: categoryContext.enabledCategories || userOptions.enabledCategories || [],
    allCategories: categoryContext.allCategories || userOptions.allCategories || [],
  });

  const scanAllCategories = (scope.type === 'all');

  if (isFull) {
    return {
      scope,
      mode: 'full',
      refresh: {
        images: true,
        size: true,
        files: true,
      },
      scanAllCategories,
      scanAllPages: false,     // Discovery traversal with safe early stop
      allowKnownTopicEarlyStop: true,
      knownPageLimit: typeof normalized.knownPageLimit === 'number' && normalized.knownPageLimit > 0 ? normalized.knownPageLimit : 3,
      processExistingOnly: false,
      discoverNewTopics: true,
      options: normalized,
    };
  }

  if (isRefresh) {
    return {
      scope,
      mode: 'refresh',
      refresh: {
        images: normalized.refreshScreenshots,
        size: normalized.refreshSizes,
        files: normalized.refreshFiles,
      },
      scanAllCategories,
      scanAllPages: true,      // Refresh traverses ALL pages up to last real page
      allowKnownTopicEarlyStop: false, // NEVER early-stop on known topics
      knownPageLimit: Infinity,
      processExistingOnly: true, // ONLY update existing catalog items
      discoverNewTopics: false,  // Do NOT import unknown topics
      options: normalized,
    };
  }

  return {
    scope,
    mode: 'incremental',
    refresh: {
      images: false,
      size: false,
      files: false,
    },
    scanAllCategories,
    scanAllPages: false,
    allowKnownTopicEarlyStop: true,
    knownPageLimit: typeof normalized.knownPageLimit === 'number' && normalized.knownPageLimit > 0 ? normalized.knownPageLimit : 3,
    processExistingOnly: false,
    discoverNewTopics: true,
    options: normalized,
  };
}

function shouldStopAfterPage({ plan, consecutiveKnownPages }) {
  if (!plan || !plan.allowKnownTopicEarlyStop) {
    return false;
  }
  return consecutiveKnownPages >= plan.knownPageLimit;
}

module.exports = {
  resolveExecutionScope,
  normalizeScraperOptions,
  createExecutionPlan,
  shouldStopAfterPage,
};

