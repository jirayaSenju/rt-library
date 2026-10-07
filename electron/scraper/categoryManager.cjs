/**
 * CategoryManager Singleton
 * Manages RuTracker scraper categories with built-ins, persistent user overrides,
 * custom categories, atomic writes, and validation.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { DEFAULT_CATEGORIES } = require('./defaultCategories.cjs');

const CONFIG_VERSION = 1;
const ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_GROUPS = ['nintendo', 'playstation', 'xbox', 'sega', 'other'];

class CategoryManager {
  constructor() {
    this.cachedConfig = null;
  }

  static getInstance() {
    if (!CategoryManager.instance) {
      CategoryManager.instance = new CategoryManager();
    }
    return CategoryManager.instance;
  }

  getUserDataPath() {
    try {
      if (process.env.RT_LIBRARY_USER_DATA_DIR) {
        return path.resolve(process.env.RT_LIBRARY_USER_DATA_DIR);
      }
      return app ? app.getPath('userData') : path.resolve(__dirname, '../../.userData');
    } catch (_) {
      return path.resolve(__dirname, '../../.userData');
    }
  }

  getConfigFilePath() {
    return path.join(this.getUserDataPath(), 'scraper-categories.json');
  }

  /**
   * Load and validate scraper-categories.json.
   * Returns clean config structure without throwing on corrupted files.
   */
  loadConfig() {
    const filePath = this.getConfigFilePath();
    if (!fs.existsSync(filePath)) {
      return {
        version: CONFIG_VERSION,
        overrides: {},
        custom: [],
      };
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== 'object') {
        console.warn(`[CATEGORIES] Corrupted scraper-categories.json (not an object). Falling back to defaults.`);
        return { version: CONFIG_VERSION, overrides: {}, custom: [] };
      }

      const overrides = parsed.overrides && typeof parsed.overrides === 'object' && !Array.isArray(parsed.overrides)
        ? parsed.overrides
        : {};

      const custom = Array.isArray(parsed.custom)
        ? parsed.custom.filter(item => item && typeof item === 'object' && typeof item.id === 'string')
        : [];

      return {
        version: parsed.version || CONFIG_VERSION,
        overrides,
        custom,
      };
    } catch (err) {
      console.warn(`[CATEGORIES] Failed to parse ${filePath}: ${err.message}. Falling back to defaults.`);
      return {
        version: CONFIG_VERSION,
        overrides: {},
        custom: [],
      };
    }
  }

  /**
   * Atomically save configuration to disk.
   */
  saveConfig(config) {
    const filePath = this.getConfigFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload = {
      version: CONFIG_VERSION,
      overrides: config.overrides || {},
      custom: config.custom || [],
    };

    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Resolve all categories: defaults + user overrides + custom categories.
   */
  getResolvedCategories() {
    const config = this.loadConfig();
    const result = [];

    // 1. Process built-ins with overrides
    for (const def of DEFAULT_CATEGORIES) {
      const override = config.overrides[def.id];
      if (override) {
        result.push({
          id: def.id,
          name: typeof override.name === 'string' && override.name.trim() ? override.name.trim() : def.name,
          group: VALID_GROUPS.includes(override.group) ? override.group : def.group,
          baseUrl: typeof override.baseUrl === 'string' && override.baseUrl.trim() ? override.baseUrl.trim() : def.baseUrl,
          titleSearch: Array.isArray(override.titleSearch) && override.titleSearch.length > 0
            ? this.normalizeTitleSearch(override.titleSearch)
            : [...def.titleSearch],
          enabled: typeof override.enabled === 'boolean' ? override.enabled : def.enabled,
          builtIn: true,
          updatedAt: override.updatedAt,
        });
      } else {
        result.push({
          ...def,
          titleSearch: [...def.titleSearch],
        });
      }
    }

    // 2. Append custom categories
    for (const c of config.custom) {
      result.push({
        id: c.id,
        name: c.name,
        group: VALID_GROUPS.includes(c.group) ? c.group : 'other',
        baseUrl: c.baseUrl,
        titleSearch: this.normalizeTitleSearch(c.titleSearch),
        enabled: c.enabled !== false,
        builtIn: false,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      });
    }

    return result;
  }

  normalizeTitleSearch(titleSearch) {
    if (!titleSearch) return [];
    const arr = Array.isArray(titleSearch) ? titleSearch : [titleSearch];
    const cleaned = [];
    const seen = new Set();

    for (const item of arr) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) {
          const lower = trimmed.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            cleaned.push(trimmed);
          }
        }
      }
    }

    return cleaned;
  }

  validateId(id, isNew = false) {
    if (!id || typeof id !== 'string') {
      throw new Error('VALIDATION_ID_EMPTY: Category ID is required.');
    }
    const cleanId = id.trim().toLowerCase();
    if (!ID_REGEX.test(cleanId)) {
      throw new Error('VALIDATION_ID_INVALID: Category ID must contain only lowercase letters, numbers, and hyphens (e.g. "sega-saturn").');
    }

    if (isNew) {
      const all = this.getResolvedCategories();
      const duplicate = all.find(c => c.id.toLowerCase() === cleanId);
      if (duplicate) {
        throw new Error(`VALIDATION_ID_DUPLICATE: A category with ID "${cleanId}" already exists.`);
      }
    }

    return cleanId;
  }

  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('VALIDATION_URL_EMPTY: RuTracker Forum URL is required.');
    }
    const cleanUrl = url.trim();
    let parsed;
    try {
      parsed = new URL(cleanUrl);
    } catch (_) {
      throw new Error('VALIDATION_URL_INVALID: Invalid URL format.');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('VALIDATION_URL_HTTPS: URL must use HTTPS.');
    }
    if (parsed.hostname !== 'rutracker.org') {
      throw new Error('VALIDATION_URL_HOST: URL must be from rutracker.org.');
    }
    if (parsed.pathname !== '/forum/viewforum.php') {
      throw new Error('VALIDATION_URL_PATH: URL path must be /forum/viewforum.php.');
    }

    const fParam = parsed.searchParams.get('f');
    if (!fParam || !/^\d+$/.test(fParam) || parseInt(fParam, 10) <= 0) {
      throw new Error('VALIDATION_URL_FORUM_ID: URL must have a valid positive integer "f" query parameter (e.g. ?f=357).');
    }

    return cleanUrl;
  }

  validateGroup(group) {
    if (group && VALID_GROUPS.includes(group)) {
      return group;
    }
    return 'other';
  }

  /**
   * Create a new custom category.
   */
  createCategory(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('VALIDATION_DATA_REQUIRED: Category data is required.');
    }

    const id = this.validateId(data.id, true);
    const name = (data.name || '').trim();
    if (!name) {
      throw new Error('VALIDATION_NAME_EMPTY: Category Name is required.');
    }

    const baseUrl = this.validateUrl(data.baseUrl);
    const group = this.validateGroup(data.group);
    const titleSearch = this.normalizeTitleSearch(data.titleSearch);

    if (titleSearch.length === 0) {
      throw new Error('VALIDATION_PATTERNS_EMPTY: At least one title search pattern is required.');
    }

    const now = new Date().toISOString();
    const newCategory = {
      id,
      name,
      group,
      baseUrl,
      titleSearch,
      enabled: data.enabled !== false,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    };

    const config = this.loadConfig();
    config.custom.push(newCategory);
    this.saveConfig(config);

    console.log(`[CATEGORIES] created id=${id} name="${name}" group=${group}`);
    return newCategory;
  }

  /**
   * Update an existing category (built-in or custom).
   */
  updateCategory(id, updates) {
    if (!id || typeof id !== 'string') {
      throw new Error('VALIDATION_ID_EMPTY: Category ID is required.');
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('VALIDATION_DATA_REQUIRED: Updates object is required.');
    }

    const cleanId = id.trim().toLowerCase();
    const isBuiltIn = DEFAULT_CATEGORIES.some(c => c.id.toLowerCase() === cleanId);
    const config = this.loadConfig();
    const now = new Date().toISOString();

    // Prepare validated fields if supplied
    const updatePayload = {};

    if (typeof updates.name === 'string') {
      const cleanName = updates.name.trim();
      if (!cleanName) throw new Error('VALIDATION_NAME_EMPTY: Category Name cannot be empty.');
      updatePayload.name = cleanName;
    }

    if (typeof updates.baseUrl === 'string') {
      updatePayload.baseUrl = this.validateUrl(updates.baseUrl);
    }

    if (typeof updates.group === 'string') {
      updatePayload.group = this.validateGroup(updates.group);
    }

    if (updates.titleSearch !== undefined) {
      const normalized = this.normalizeTitleSearch(updates.titleSearch);
      if (normalized.length === 0) {
        throw new Error('VALIDATION_PATTERNS_EMPTY: At least one title search pattern is required.');
      }
      updatePayload.titleSearch = normalized;
    }

    if (typeof updates.enabled === 'boolean') {
      updatePayload.enabled = updates.enabled;
    }

    updatePayload.updatedAt = now;

    if (isBuiltIn) {
      config.overrides[cleanId] = {
        ...(config.overrides[cleanId] || {}),
        ...updatePayload,
      };
      this.saveConfig(config);
      console.log(`[CATEGORIES] updated built-in id=${cleanId}`);
    } else {
      const idx = config.custom.findIndex(c => c.id.toLowerCase() === cleanId);
      if (idx === -1) {
        throw new Error(`CATEGORY_NOT_FOUND: Category "${cleanId}" not found.`);
      }
      config.custom[idx] = {
        ...config.custom[idx],
        ...updatePayload,
        id: config.custom[idx].id, // Ensure ID is immutable
      };
      this.saveConfig(config);
      console.log(`[CATEGORIES] updated custom id=${cleanId}`);
    }

    return this.getResolvedCategories().find(c => c.id.toLowerCase() === cleanId);
  }

  /**
   * Delete a custom category. Built-in categories cannot be deleted.
   */
  deleteCategory(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('VALIDATION_ID_EMPTY: Category ID is required.');
    }

    const cleanId = id.trim().toLowerCase();
    const isBuiltIn = DEFAULT_CATEGORIES.some(c => c.id.toLowerCase() === cleanId);
    if (isBuiltIn) {
      throw new Error(`CANNOT_DELETE_BUILTIN: Built-in category "${cleanId}" cannot be deleted. Use disable or reset instead.`);
    }

    const config = this.loadConfig();
    const initialLen = config.custom.length;
    config.custom = config.custom.filter(c => c.id.toLowerCase() !== cleanId);

    if (config.custom.length === initialLen) {
      throw new Error(`CATEGORY_NOT_FOUND: Custom category "${cleanId}" not found.`);
    }

    this.saveConfig(config);
    console.log(`[CATEGORIES] deleted id=${cleanId}`);
    return true;
  }

  /**
   * Enable or disable a category.
   */
  setCategoryEnabled(id, enabled) {
    return this.updateCategory(id, { enabled: Boolean(enabled) });
  }

  /**
   * Reset a built-in category to its default settings.
   */
  resetCategory(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('VALIDATION_ID_EMPTY: Category ID is required.');
    }

    const cleanId = id.trim().toLowerCase();
    const isBuiltIn = DEFAULT_CATEGORIES.some(c => c.id.toLowerCase() === cleanId);
    if (!isBuiltIn) {
      throw new Error(`NOT_BUILTIN: Custom category "${cleanId}" cannot be reset to default.`);
    }

    const config = this.loadConfig();
    if (config.overrides[cleanId]) {
      delete config.overrides[cleanId];
      this.saveConfig(config);
      console.log(`[CATEGORIES] reset id=${cleanId}`);
    }

    return this.getResolvedCategories().find(c => c.id.toLowerCase() === cleanId);
  }

  /**
   * Test category URL and titleSearch patterns against RuTracker (Read-only, page 1 only).
   */
  async testCategory(data) {
    const baseUrl = this.validateUrl(data.baseUrl);
    const titleSearch = this.normalizeTitleSearch(data.titleSearch);

    if (titleSearch.length === 0) {
      throw new Error('VALIDATION_PATTERNS_EMPTY: At least one title search pattern is required.');
    }

    const { ScraperBrowserSession } = require('../../scraper/browserSession.cjs');
    let session = null;

    try {
      console.log(`[CATEGORIES] Testing category URL: ${baseUrl} with patterns: ${JSON.stringify(titleSearch)}`);
      session = new ScraperBrowserSession({ headed: false });
      await session.init();

      const page = session.page;
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check for Cloudflare / DDOS challenge
      const pageTitle = await page.title();
      const content = await page.content();

      if (
        pageTitle.includes('Just a moment') ||
        content.includes('cf-browser-verification') ||
        content.includes('Checking your browser')
      ) {
        return {
          success: false,
          status: 'INTERACTION_REQUIRED',
          totalTopics: 0,
          matchedTopics: 0,
          sampleMatches: [],
          error: 'Cloudflare challenge detected. Please verify session in Scraper tab.',
        };
      }

      // Check if login is required / guest redirect
      if (content.includes('login.php') || content.includes('form-login') || page.url().includes('login.php')) {
        return {
          success: false,
          status: 'SESSION_REQUIRED',
          totalTopics: 0,
          matchedTopics: 0,
          sampleMatches: [],
          error: 'RuTracker session cookie required to view this forum.',
        };
      }

      // Extract topic titles from forum page table
      const topics = await page.evaluate(() => {
        const results = [];
        // RuTracker topic links usually have class .tt-text or are inside table#tor-tbl
        const rows = document.querySelectorAll('#tor-tbl tbody tr, #forum_main tbody tr, tr.hl-tr');
        if (rows.length > 0) {
          rows.forEach((row) => {
            const link = row.querySelector('a.tt-text, a.torTopic, a.genmed, a[href*="viewtopic.php?t="]');
            if (link && link.textContent) {
              const text = link.textContent.trim();
              if (text && !results.includes(text)) {
                results.push(text);
              }
            }
          });
        }

        // Fallback: search any viewtopic links
        if (results.length === 0) {
          const links = document.querySelectorAll('a[href*="viewtopic.php?t="]');
          links.forEach((a) => {
            const text = a.textContent ? a.textContent.trim() : '';
            if (text && text.length > 5 && !results.includes(text)) {
              results.push(text);
            }
          });
        }

        return results;
      });

      const totalTopics = topics.length;
      if (totalTopics === 0) {
        return {
          success: true,
          status: 'NO_TOPICS',
          totalTopics: 0,
          matchedTopics: 0,
          sampleMatches: [],
        };
      }

      // Match against title patterns (case-insensitive includes)
      const matched = topics.filter((title) => {
        const lowerTitle = title.toLowerCase();
        return titleSearch.some((pattern) => lowerTitle.includes(pattern.toLowerCase()));
      });

      return {
        success: true,
        status: 'OK',
        totalTopics,
        matchedTopics: matched.length,
        sampleMatches: matched.slice(0, 5),
      };
    } catch (err) {
      console.error('[CATEGORIES] testCategory failed:', err.message);
      return {
        success: false,
        status: 'ERROR',
        totalTopics: 0,
        matchedTopics: 0,
        sampleMatches: [],
        error: err.message,
      };
    } finally {
      if (session) {
        try {
          await session.close('test_finished');
        } catch (_) {}
      }
    }
  }
}

module.exports = {
  CategoryManager,
  DEFAULT_CATEGORIES,
};
