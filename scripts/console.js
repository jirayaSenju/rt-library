/**
 * EcoHub - Browser Console Scraper Incremental Inteligente
 * 
 * Implementa coleta incremental com:
 * 1. Buffer de repetidos consecutivos (stop-on-first-seen com buffer de tolerância)
 * 2. Idempotência por topicId único
 * 3. Retry com Backoff Exponencial (1s, 2s, 4s) em erros de rede
 * 4. Tabela de Auditoria de Coletas (salva em IndexedDB)
 * 5. Modo Incremental (padrão) vs Modo Full (--full)
 * 
 * Como usar no Console (F12):
 * • EcoHubScraper.start()                      -> Iniciar coleta incremental (para ao atingir buffer/itens já vistos)
 * • EcoHubScraper.startFull()                  -> Iniciar coleta FULL (varre todas as páginas ignorando critério de parada)
 * • EcoHubScraper.setOptions({ bufferLimit: 5 })-> Ajustar tamanho do buffer de repetidos consecutivos
 * • EcoHubScraper.getAuditLogs()               -> Exibir relatório e auditoria das execuções anteriores
 * • EcoHubScraper.downloadCategory('xbox')     -> Baixar 1 arquivo JSON de categoria específica (ex: 'xbox', 'switch')
 * • EcoHubScraper.downloadAll()                -> Baixar JSONs de todas as categorias individualmente
 * • EcoHubScraper.downloadBackup()             -> Baixar 1 arquivo JSON consolidado de backup
 * • EcoHubScraper.importBackup()               -> Restaurar backup salvo para o IndexedDB
 */

(function () {
  const CATEGORIES = [
    { id: "switch", name: "Nintendo Switch", group: "nintendo", baseUrl: "https://rutracker.org/forum/viewforum.php?f=1605", titleSearch: ["[Nintendo Switch]"], enabled: true, builtIn: true },
    { id: "psx", name: "Playstation 1", group: "playstation", baseUrl: "https://rutracker.org/forum/viewforum.php?f=908", titleSearch: ["[PS]"], enabled: true, builtIn: true },
    { id: "ps2", name: "Playstation 2", group: "playstation", baseUrl: "https://rutracker.org/forum/viewforum.php?f=357", titleSearch: ["[PS2]"], enabled: true, builtIn: true },
    { id: "psp", name: "Playstation Portable", group: "playstation", baseUrl: "https://rutracker.org/forum/viewforum.php?f=1352", titleSearch: ["[PSP]"], enabled: true, builtIn: true },
    { id: "ps3", name: "Playstation 3", group: "playstation", baseUrl: "https://rutracker.org/forum/viewforum.php?f=886", titleSearch: ["[PS3]"], enabled: true, builtIn: true },
    { id: "ps4", name: "Playstation 4", group: "playstation", baseUrl: "https://rutracker.org/forum/viewforum.php?f=973", titleSearch: ["[PS4]"], enabled: true, builtIn: true },
    { id: "ps5", name: "Playstation 5", group: "playstation", baseUrl: "https://rutracker.org/forum/viewforum.php?f=546", titleSearch: ["[PS5]"], enabled: true, builtIn: true },
    { id: "psvita", name: "Playstation Vita", group: "playstation", baseUrl: "https://rutracker.org/forum/viewforum.php?f=595", titleSearch: ["[PS Vita]"], enabled: true, builtIn: true },
    { id: "xbox", name: "Original Xbox", group: "xbox", baseUrl: "https://rutracker.org/forum/viewforum.php?f=887", titleSearch: ["Original Xbox", "XBOX", "Xbox"], enabled: true, builtIn: true },
    { id: "xbox360", name: "Xbox 360", group: "xbox", baseUrl: "https://rutracker.org/forum/viewforum.php?f=510", titleSearch: ["[XBOX360]"], enabled: true, builtIn: true },
    { id: "wii", name: "Nintendo Wii", group: "nintendo", baseUrl: "https://rutracker.org/forum/viewforum.php?f=773", titleSearch: ["[Nintendo Wii]"], enabled: true, builtIn: true },
    { id: "gamecube", name: "Nintendo GameCube", group: "nintendo", baseUrl: "https://rutracker.org/forum/viewforum.php?f=773", titleSearch: ["[GameCube]"], enabled: true, builtIn: true },
    { id: "wiiu", name: "Nintendo Wii U", group: "nintendo", baseUrl: "https://rutracker.org/forum/viewforum.php?f=773", titleSearch: ["[Nintendo Wii U]"], enabled: true, builtIn: true },
    { id: "ds", name: "Nintendo DS", group: "nintendo", baseUrl: "https://rutracker.org/forum/viewforum.php?f=774", titleSearch: ["[NDS]"], enabled: true, builtIn: true },
    { id: "3ds", name: "Nintendo 3DS", group: "nintendo", baseUrl: "https://rutracker.org/forum/viewforum.php?f=774", titleSearch: ["[3DS]"], enabled: true, builtIn: true },
  ];

  function resolveExecutionScope({ category, enabledCategories = [], allCategories = [] } = {}) {
    const selected = (category && typeof category === 'string') ? category.trim() : null;

    if (!selected || selected === 'all') {
      const activeCategories = Array.isArray(enabledCategories) && enabledCategories.length > 0
        ? enabledCategories
        : (Array.isArray(allCategories) ? allCategories.filter((c) => c.enabled !== false) : CATEGORIES.filter((c) => c.enabled !== false));

      return {
        type: 'all',
        targetCategoryId: null,
        categoryIds: activeCategories.map((c) => (typeof c === 'string' ? c : c.id)),
        categories: activeCategories,
      };
    }

    const targetId = selected.toLowerCase();
    const searchPool = Array.isArray(allCategories) && allCategories.length > 0
      ? allCategories
      : (Array.isArray(enabledCategories) && enabledCategories.length > 0 ? enabledCategories : CATEGORIES);

    const found = searchPool.find((c) => (typeof c === 'string' ? c.toLowerCase() : c.id.toLowerCase()) === targetId);

    if (!found) {
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
        scanAllPages: false,
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
        scanAllPages: true,
        allowKnownTopicEarlyStop: false,
        knownPageLimit: Infinity,
        processExistingOnly: true,
        discoverNewTopics: false,
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

  class DBStore {
    constructor(dbName = 'EcoHubCatalogDB') {
      this.dbName = dbName;
      this.catStore = 'categories';
      this.auditStore = 'audit_logs';
      this.db = null;
      this._memCats = new Map();
      this._memAudits = [];
    }

    async init() {
      if (typeof indexedDB === 'undefined') return null;
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 2);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.catStore)) {
            db.createObjectStore(this.catStore, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(this.auditStore)) {
            db.createObjectStore(this.auditStore, { keyPath: 'id' });
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async getCategory(id) {
      if (typeof indexedDB === 'undefined') {
        return this._memCats.get(id) || null;
      }
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.catStore, 'readonly');
        const store = tx.objectStore(this.catStore);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async saveCategory(catData) {
      if (typeof indexedDB === 'undefined') {
        this._memCats.set(catData.id, JSON.parse(JSON.stringify(catData)));
        return;
      }
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.catStore, 'readwrite');
        const store = tx.objectStore(this.catStore);
        const req = store.put(catData);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    async getAllCategories() {
      if (typeof indexedDB === 'undefined') {
        return Array.from(this._memCats.values());
      }
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.catStore, 'readonly');
        const store = tx.objectStore(this.catStore);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async saveAuditLog(logEntry) {
      if (typeof indexedDB === 'undefined') {
        this._memAudits.push(logEntry);
        return;
      }
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.auditStore, 'readwrite');
        const store = tx.objectStore(this.auditStore);
        const req = store.put(logEntry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    async getAuditLogs() {
      if (typeof indexedDB === 'undefined') {
        return [...this._memAudits];
      }
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.auditStore, 'readonly');
        const store = tx.objectStore(this.auditStore);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async clear() {
      if (typeof indexedDB === 'undefined') {
        this._memCats.clear();
        this._memAudits = [];
        return;
      }
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([this.catStore, this.auditStore], 'readwrite');
        tx.objectStore(this.catStore).clear();
        tx.objectStore(this.auditStore).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  const KNOWN_PLATFORMS = [
    'nintendo switch', 'switch', 'ns',
    'playstation 1', 'playstation 2', 'playstation 3', 'playstation 4', 'playstation 5',
    'ps1', 'psx', 'ps2', 'ps3', 'ps4', 'ps5', 'psp', 'ps vita', 'psvita', 'psv',
    'xbox 360', 'xbox360', 'x360', 'original xbox', 'xbox',
    'nintendo wii u', 'nintendo wii', 'wii u', 'wiiu', 'wii',
    'nintendo gamecube', 'gamecube', 'ngc', 'gc',
    'nintendo 3ds', 'nintendo ds', '3ds', 'nds', 'ds',
    'sega dreamcast', 'dreamcast', 'dc',
    'pc', 'windows',
  ];

  const KNOWN_FORMATS = [
    'nsz', 'nsp', 'xci', 'iso', 'wbfs', 'god', 'pkg', 'cia', 'cso', 'gcm',
    'cdi', 'gdi', 'rom', 'vpk', 'freeboot', 'jtag', 'cfi', 'eboot', 'chd',
    'cuesheet', 'bin/cue', 'rvz', 'wua', 'nkit', 'cxi',
  ];

  const KNOWN_LANGUAGES = [
    'russound', 'rus/eng', 'eng/rus', 'rus', 'eng', 'jap', 'kor', 'por', 'spa',
    'ger', 'fra', 'ita', 'multi', 'sound', 'text', 'subs', 'rus/sound', 'rus/text',
  ];

  const METADATA_LABELS = [
    'год выпуска', 'год', 'дата выпуска', 'дата выхода', 'год релиза',
    'жанр', 'разработчик', 'издатель', 'издательство', 'издатель в россии',
    'формат', 'формат образа', 'формат дампа', 'формат игры', 'формат файла', 'тип образа', 'вид раздачи',
    'мультиплеер', 'мультиплеер игры', 'мультиплейер игры', 'сетевой режим',
    'язык интерфейса', 'язык интерфейса игры', 'язык', 'языки интерфейса',
    'язык озвучки', 'озвучка', 'версия', 'версия игры', 'версия прошивки',
    'размер', 'описание', 'типы изданий', 'тип издания', 'таблетка',
    'системные требования', 'требуемая версия прошивки', 'работоспособность проверена',
    'код диска', 'регион', 'прошивка', 'платформа',
  ];

  function isReleaseQualifierToken(token) {
    if (!token || typeof token !== 'string') return false;
    const clean = token.trim().toLowerCase().replace(/^\[|\]$|^\(|\)$/g, '').trim();
    if (!clean) return false;
    if (/^multi\d*$/i.test(clean)) return true;
    if (/^(?:rus|eng|jap|ger|fra|ita|spa|por|kor|chi)(?:[\/+& -](?:rus|eng|jap|ger|fra|ita|spa|por|kor|chi|multi\d*))+$/i.test(clean)) return true;
    if (/^(?:v\d+[\d.]*|update\s*\d+[\d.]*|patch\s*\d+[\d.]*)$/i.test(clean)) return true;
    if (/^(?:repack|rip|scene|eshop|uncompressed|dlc|dlcs|fixed|proper|mod|undub|uncensored|beta|demo|remastered|hd|gold|goty|full)$/i.test(clean)) return true;
    if (KNOWN_PLATFORMS.includes(clean)) return true;
    if (KNOWN_FORMATS.includes(clean)) return true;
    if (KNOWN_LANGUAGES.includes(clean)) return true;
    if (/^(?:релиз|release|repack|сборка|rip)\s+(?:от|by)/i.test(clean)) return true;
    if (/^[lpdf]$/i.test(clean)) return true;
    return false;
  }

  function normalizeCanonicalGameTitle(rawTitle, topicTitle = '') {
    const canonicalTitleRaw = (rawTitle && typeof rawTitle === 'string' ? rawTitle : (topicTitle || '')).trim();
    if (!canonicalTitleRaw) {
      return { canonicalTitle: 'Untitled', canonicalTitleRaw: '', releaseGroup: null, qualifiers: [] };
    }
    let title = canonicalTitleRaw;
    let releaseGroup = null;
    const qualifiers = [];

    const rgRegexes = [
      /\((?:релиз|release|repack|сборка|rip)\s+(?:от|by)\s+([^)]+)\)/i,
      /\[(?:релиз|release|repack|сборка|rip)\s+(?:от|by)\s+([^\]]+)\]/i,
      /(?:релиз|release|repack|сборка|rip)\s+(?:от|by)\s+([A-Za-z0-9._-]+)/i,
    ];

    for (const regex of rgRegexes) {
      const match = title.match(regex);
      if (match) {
        releaseGroup = match[1].trim();
        title = title.replace(match[0], ' ');
        qualifiers.push(match[0].trim());
        break;
      }
    }

    if (!releaseGroup && topicTitle) {
      for (const regex of rgRegexes) {
        const match = topicTitle.match(regex);
        if (match) {
          releaseGroup = match[1].trim();
          break;
        }
      }
    }

    title = title.replace(/\[([^\]]+)\]/g, (fullMatch, content) => {
      if (isReleaseQualifierToken(content)) {
        qualifiers.push(content.trim());
        return ' ';
      }
      return fullMatch;
    });

    title = title.replace(/\(([^)]+)\)/g, (fullMatch, content) => {
      if (isReleaseQualifierToken(content)) {
        qualifiers.push(content.trim());
        return ' ';
      }
      return fullMatch;
    });

    const words = title.split(/\s+/);
    const filteredWords = [];
    for (const word of words) {
      const cleanWord = word.replace(/^[\[\(]|[\)\]]$/g, '').trim();
      if (isReleaseQualifierToken(cleanWord) && (KNOWN_FORMATS.includes(cleanWord.toLowerCase()) || KNOWN_LANGUAGES.includes(cleanWord.toLowerCase()))) {
        qualifiers.push(cleanWord);
        continue;
      }
      filteredWords.push(word);
    }
    title = filteredWords.join(' ');

    title = title
      .replace(/^[:\s\-\=\/\|\+]+/, '')
      .replace(/[:\s\-\=\/\|\+]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!title) {
      title = canonicalTitleRaw.replace(/^\[[^\]]+\]\s*/, '').trim() || canonicalTitleRaw;
    }

    return { canonicalTitle: title, canonicalTitleRaw, releaseGroup, qualifiers };
  }

  function normalizeTitleForDedupe(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['"’`]/g, '')
      .replace(/[^a-z0-9\u0400-\u04FF]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractBTIH(magnetUrl) {
    if (!magnetUrl || typeof magnetUrl !== 'string') return null;
    const match = magnetUrl.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    if (!match) return null;
    return match[1].toUpperCase();
  }

  function extractCanonicalTitleFromDOM(docOrElement, topicTitle = '') {
    if (!docOrElement) {
      const norm = normalizeCanonicalGameTitle(topicTitle, topicTitle);
      return {
        canonicalTitle: norm.canonicalTitle,
        canonicalTitleRaw: topicTitle,
        method: 'TITLE_CANONICAL_FALLBACK',
        releaseGroup: norm.releaseGroup,
      };
    }

    const postBody = docOrElement.querySelector ? (docOrElement.querySelector('.post_body') || docOrElement) : docOrElement;
    if (!postBody) {
      const norm = normalizeCanonicalGameTitle(topicTitle, topicTitle);
      return {
        canonicalTitle: norm.canonicalTitle,
        canonicalTitleRaw: topicTitle,
        method: 'TITLE_CANONICAL_FALLBACK',
        releaseGroup: norm.releaseGroup,
      };
    }

    const releaseYearMarkers = ['год выпуска', 'год', 'дата выпуска', 'дата выхода', 'год релиза'];
    const keyNodes = Array.from(postBody.querySelectorAll('.post-b, b, strong, span'));
    let yearMarkerNode = null;

    for (const node of keyNodes) {
      if (node.closest && (node.closest('.sp-wrap') || node.closest('.q-wrap') || node.closest('.signature'))) {
        continue;
      }
      const text = (node.textContent || '').trim().toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
      if (releaseYearMarkers.includes(text)) {
        yearMarkerNode = node;
        break;
      }
    }

    if (!yearMarkerNode) {
      for (const node of keyNodes) {
        if (node.closest && (node.closest('.sp-wrap') || node.closest('.q-wrap') || node.closest('.signature'))) {
          continue;
        }
        const text = (node.textContent || '').trim().toLowerCase();
        if (text.startsWith('год выпуска') || text.startsWith('дата выпуска') || text.startsWith('дата выхода')) {
          yearMarkerNode = node;
          break;
        }
      }
    }

    let extractedRawTitle = null;
    let method = 'before_release_year';

    if (yearMarkerNode) {
      const getCleanNodeText = (node) => {
        if (!node) return '';
        if (node.nodeType === 1) {
          const el = node;
          if (el.classList && (el.classList.contains('sp-wrap') || el.classList.contains('q-wrap') || el.classList.contains('attach') || el.classList.contains('signature'))) {
            return '';
          }
          if (['IMG', 'BR', 'HR', 'SCRIPT', 'STYLE'].includes(el.tagName)) {
            return '';
          }
          const elText = (el.textContent || '').trim().toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
          if (METADATA_LABELS.includes(elText)) {
            return '';
          }
          return (el.textContent || '').trim();
        } else if (node.nodeType === 3) {
          return (node.textContent || '').trim();
        }
        return '';
      };

      const allPreceding = [];
      const treeWalker = (postBody.ownerDocument || docOrElement.ownerDocument || (typeof document !== 'undefined' ? document : null))?.createTreeWalker
        ? (postBody.ownerDocument || docOrElement.ownerDocument || document).createTreeWalker(postBody, 5, null, false)
        : null;

      if (treeWalker) {
        let currentNode = treeWalker.nextNode();
        while (currentNode) {
          if (currentNode === yearMarkerNode) break;
          if (currentNode.contains && currentNode.contains(yearMarkerNode)) {
            currentNode = treeWalker.nextNode();
            continue;
          }
          const text = getCleanNodeText(currentNode);
          if (text && text.length > 1) {
            const lower = text.toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
            if (!METADATA_LABELS.some(lbl => lower === lbl || lower.startsWith(lbl + ':') || lower.startsWith(lbl + ' :'))) {
              let isStyledHeading = false;
              if (currentNode.nodeType === 1) {
                const style = currentNode.getAttribute ? (currentNode.getAttribute('style') || '') : '';
                if (/font-size:\s*(?:2[0-9]|1[8-9]|[3-9][0-9])px/i.test(style) || ['H1', 'H2', 'H3', 'H4'].includes(currentNode.tagName)) {
                  isStyledHeading = true;
                }
              }
              allPreceding.push({ node: currentNode, text, isStyledHeading });
            }
          }
          currentNode = treeWalker.nextNode();
        }
      } else {
        let curr = yearMarkerNode.previousSibling;
        while (curr) {
          const text = getCleanNodeText(curr);
          if (text && text.length > 1) {
            const lower = text.toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
            if (!METADATA_LABELS.some(lbl => lower === lbl || lower.startsWith(lbl + ':'))) {
              allPreceding.unshift({ node: curr, text, isStyledHeading: false });
            }
          }
          curr = curr.previousSibling;
        }
      }

      const styledHeading = allPreceding.find(c => c.isStyledHeading);
      if (styledHeading && styledHeading.text) {
        extractedRawTitle = styledHeading.text;
        method = 'before_release_year_styled';
      } else if (allPreceding.length > 0) {
        const validCandidates = allPreceding.filter(c => c.text.length >= 2);
        if (validCandidates.length > 0) {
          extractedRawTitle = validCandidates[0].text;
          method = 'before_release_year';
        }
      }
    }

    if (!extractedRawTitle) {
      extractedRawTitle = topicTitle || 'Untitled';
      method = 'TITLE_CANONICAL_FALLBACK';
    }

    const firstLine = extractedRawTitle.split(/[\r\n]+/)[0].trim();
    const normalizedResult = normalizeCanonicalGameTitle(firstLine || extractedRawTitle, topicTitle);

    return {
      canonicalTitle: normalizedResult.canonicalTitle,
      canonicalTitleRaw: extractedRawTitle,
      method,
      releaseGroup: normalizedResult.releaseGroup,
    };
  }

  function cleanText(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') raw = String(raw);

    let val = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();

    val = val.replace(/^[:\s\-\=\[\]\(\)]+/, '').replace(/[:\s\-\=\[\]\(\)]+$/, '').trim();
    return val.length > 0 ? val : null;
  }

  function normalizeReleaseYear(raw) {
    if (raw === null || raw === undefined) return null;
    const currentMaxYear = new Date().getFullYear() + 10;
    const minYear = 1970;

    if (typeof raw === 'number' && Number.isInteger(raw)) {
      if (raw >= minYear && raw <= currentMaxYear) return raw;
      return null;
    }

    if (typeof raw === 'string') {
      const cleaned = raw.replace(/\s*г\.?$/i, '').trim();
      if (/^\d{4}$/.test(cleaned)) {
        const parsed = parseInt(cleaned, 10);
        if (parsed >= minYear && parsed <= currentMaxYear) return parsed;
      }
      const match = cleaned.match(/\b(19[7-9]\d|20[0-3]\d)\b/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (parsed >= minYear && parsed <= currentMaxYear) return parsed;
      }
    }
    return null;
  }

  function normalizeDeveloper(raw) {
    const cleaned = cleanText(raw);
    if (!cleaned) return { raw: null, developer: null, developers: [] };
    const developers = cleaned
      .split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    return { raw: cleaned, developer: cleaned, developers: developers.length > 0 ? developers : [cleaned] };
  }

  function normalizePublisher(raw) {
    const cleaned = cleanText(raw);
    if (!cleaned) return { raw: null, publisher: null, publishers: [] };
    const publishers = cleaned
      .split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    return { raw: cleaned, publisher: cleaned, publishers: publishers.length > 0 ? publishers : [cleaned] };
  }

  function normalizeGenre(raw) {
    const cleaned = cleanText(raw);
    if (!cleaned) return { raw: null, genre: null, genres: [] };
    const genres = cleaned.split(/[,;/|]+/).map(s => s.trim()).filter(s => s.length > 0);
    const uniqueGenres = [];
    const seen = new Set();
    for (const g of genres) {
      const key = g.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueGenres.push(g);
      }
    }
    return { raw: cleaned, genre: uniqueGenres.join(', '), genres: uniqueGenres };
  }

  function normalizeVersion(raw) {
    const cleaned = cleanText(raw);
    if (!cleaned) return { raw: null, version: null };
    let norm = cleaned;
    const prefixMatch = norm.match(/^(?:v(?:er(?:sion)?)?\.?\s*)(\d+.*)$/i);
    if (prefixMatch) norm = prefixMatch[1].trim();
    return { raw: cleaned, version: norm || cleaned };
  }

  const LANGUAGE_TOKEN_MAP = [
    { code: 'en', patterns: [/\beng\b/i, /\benglish\b/i, /английский/i, /английская/i, /английском/i, /\bангл\b/i, /\ben\b/i] },
    { code: 'ru', patterns: [/\brus\b/i, /\brussian\b/i, /русский/i, /русская/i, /русском/i, /\bрус\b/i, /\bru\b/i, /russound/i] },
    { code: 'ja', patterns: [/\bjpn\b/i, /\bjap\b/i, /\bjapanese\b/i, /японский/i, /японская/i, /японском/i, /\bяп\b/i, /\bja\b/i] },
    { code: 'de', patterns: [/\bger\b/i, /\bdeu\b/i, /\bgerman\b/i, /немецкий/i, /немецкая/i, /немецком/i, /\bнем\b/i, /\bde\b/i] },
    { code: 'fr', patterns: [/\bfre\b/i, /\bfra\b/i, /\bfrench\b/i, /французский/i, /французская/i, /французском/i, /\bфр\b/i, /\bfr\b/i] },
    { code: 'es', patterns: [/\bspa\b/i, /\bspanish\b/i, /испанский/i, /испанская/i, /испанском/i, /\bисп\b/i, /\bes\b/i] },
    { code: 'it', patterns: [/\bita\b/i, /\bitalian\b/i, /итальянский/i, /итальянская/i, /итальянском/i, /\bит\b/i, /\bit\b/i] },
    { code: 'pt', patterns: [/\bpor\b/i, /\bportuguese\b/i, /португальский/i, /португальская/i, /португальском/i, /\bпорт\b/i, /\bpt\b/i, /pt-br/i, /\bbr\b/i] },
    { code: 'zh', patterns: [/\bchi\b/i, /\bzho\b/i, /\bchinese\b/i, /китайский/i, /китайская/i, /китайском/i, /\bкит\b/i, /\bzh\b/i] },
    { code: 'ko', patterns: [/\bkor\b/i, /\bkorean\b/i, /корейский/i, /корейская/i, /корейском/i, /\bкор\b/i, /\bko\b/i] },
    { code: 'pl', patterns: [/\bpol\b/i, /\bpolish\b/i, /польский/i, /польская/i, /польском/i, /\bpl\b/i] },
    { code: 'uk', patterns: [/\bukr\b/i, /\bukrainian\b/i, /украинский/i, /украинская/i, /украинском/i, /\buk\b/i] },
  ];

  function normalizeLanguages(raw) {
    const cleaned = cleanText(raw);
    if (!cleaned) return { raw: null, codes: [], display: null, unknown: [] };
    const detectedCodes = [];
    const unknownTokens = [];
    for (const entry of LANGUAGE_TOKEN_MAP) {
      if (entry.patterns.some(pat => pat.test(cleaned))) {
        if (!detectedCodes.includes(entry.code)) detectedCodes.push(entry.code);
      }
    }
    if (/multi\d*/i.test(cleaned) && detectedCodes.length === 0) {
      const multiMatch = cleaned.match(/multi\d*/i);
      if (multiMatch) unknownTokens.push(multiMatch[0].toUpperCase());
    }
    return {
      raw: cleaned,
      codes: detectedCodes,
      display: detectedCodes.length > 0 ? detectedCodes.join(', ') : cleaned,
      unknown: unknownTokens,
    };
  }

  function normalizeAudio(raw) {
    return normalizeLanguages(raw);
  }

  function normalizeImageFormat(raw) {
    const cleaned = cleanText(raw);
    if (!cleaned) return null;
    let norm = cleaned.replace(/^\.+/, '').trim().toUpperCase();
    const parts = norm.split(/[,/ ]+/).map(p => p.replace(/^\.+/, '').trim()).filter(Boolean);
    if (parts.length > 1) return parts.join(', ');
    return norm.length > 0 ? norm : null;
  }

  function normalizeMultiplayer(raw) {
    const cleaned = cleanText(raw);
    if (!cleaned) return { raw: null, multiplayer: null };
    const lower = cleaned.toLowerCase();
    if (lower === 'нет' || lower === 'no' || lower === 'none' || lower === 'отсутствует' || lower === 'false' || lower.startsWith('нет ')) {
      return { raw: cleaned, multiplayer: false };
    }
    if (lower === 'да' || lower === 'yes' || lower === 'true' || lower.includes('игрок') || lower.includes('player') || lower.includes('online') || lower.includes('онлайн') || lower.includes('сетев') || lower.includes('локальн') || lower.includes('coop') || lower.includes('кооп') || /\b\d+\s*[-x]\s*\d+\b/.test(lower) || /\b\d+\b/.test(lower)) {
      return { raw: cleaned, multiplayer: true };
    }
    return { raw: cleaned, multiplayer: null };
  }

  function normalizeRegion(raw, topicTitle = '') {
    const cleaned = cleanText(raw);
    const combined = [cleaned, topicTitle].filter(Boolean).join(' ');
    const KNOWN_REGIONS = [
      { name: 'EUR', pattern: /\b(?:eur|europe|европа|pal)\b/i },
      { name: 'USA', pattern: /\b(?:usa|us|ntsc-u|ntsc-us|ntsc)\b/i },
      { name: 'JPN', pattern: /\b(?:jpn|jap|japan|япония|ntsc-j)\b/i },
      { name: 'ASIA', pattern: /\b(?:asia|азия)\b/i },
      { name: 'WORLD', pattern: /\b(?:region\s*free|free|world|global)\b/i },
      { name: 'KOR', pattern: /\b(?:kor|korea|корея)\b/i },
    ];
    for (const r of KNOWN_REGIONS) {
      if (r.pattern.test(combined)) return { raw: cleaned || r.name, region: r.name };
    }
    return { raw: cleaned, region: cleaned ? cleaned.toUpperCase() : null };
  }

  function normalizeItemMetadata(item = {}) {
    const releaseYear = normalizeReleaseYear(item.releaseYear || item.release_year);
    const devNorm = normalizeDeveloper(item.developer);
    const pubNorm = normalizePublisher(item.publisher);
    const genreNorm = normalizeGenre(item.genre);
    const verNorm = normalizeVersion(item.version || item.gameVersion || item.game_version);
    const langNorm = normalizeLanguages(item.interfaceLanguage || item.interface_language || item.language);
    const audioNorm = normalizeAudio(item.voiceLanguage || item.voice_language || item.audio);
    const imageFormat = normalizeImageFormat(item.imageFormat || item.image_format);
    const multiNorm = normalizeMultiplayer(item.multiplayer);
    const regionNorm = normalizeRegion(item.region, item.topicTitle || item.title);

    return {
      releaseYear,
      developer: devNorm.developer,
      developerRaw: devNorm.raw,
      developers: devNorm.developers,
      publisher: pubNorm.publisher,
      publisherRaw: pubNorm.raw,
      publishers: pubNorm.publishers,
      genre: genreNorm.genre,
      genreRaw: genreNorm.raw,
      genres: genreNorm.genres,
      version: verNorm.version,
      versionRaw: verNorm.raw,
      language: langNorm.display || langNorm.raw,
      interfaceLanguage: langNorm.display || langNorm.raw,
      languageCodes: langNorm.codes,
      voiceLanguage: audioNorm.display || audioNorm.raw,
      audioLanguageCodes: audioNorm.codes,
      imageFormat,
      multiplayer: multiNorm.multiplayer !== null ? (multiNorm.multiplayer ? 'Yes' : 'No') : multiNorm.raw,
      multiplayerBoolean: multiNorm.multiplayer,
      multiplayerRaw: multiNorm.raw,
      region: regionNorm.region,
      regionRaw: regionNorm.raw,
    };
  }

  class Scraper {
    constructor() {
      this.isRunning = false;
      this.store = new DBStore();
      
      // Parâmetros de Configuração Padrão
      this.concurrency = 6;
      this.bufferLimit = 5;       // Limite do Buffer de repetidos consecutivos (legado)
      this.knownPageLimit = 3;    // Limite de páginas consecutivas 100% conhecidas antes de encerrar categoria
      this.maxPages = 144;        // Limite máximo de segurança de páginas por categoria
      this.delayPageMs = 500;
      this.delayTopicMs = 50;
      this.mode = 'incremental';  // 'incremental' ou 'full'
      this.refreshScreenshots = false;
      this.refreshSizes = false;
      this.refreshFiles = false;
    }

    setOptions(opts = {}) {
      if (opts.concurrency && opts.concurrency > 0) this.concurrency = opts.concurrency;
      if (opts.bufferLimit !== undefined && opts.bufferLimit >= 0) this.bufferLimit = opts.bufferLimit;
      if (opts.knownPageLimit !== undefined && opts.knownPageLimit > 0) this.knownPageLimit = opts.knownPageLimit;
      if (opts.maxPages && opts.maxPages > 0) this.maxPages = opts.maxPages;
      if (opts.delayPageMs !== undefined) this.delayPageMs = opts.delayPageMs;
      if (opts.delayTopicMs !== undefined) this.delayTopicMs = opts.delayTopicMs;
      if (opts.mode) this.mode = opts.mode;
      if (opts.refreshScreenshots !== undefined) this.refreshScreenshots = Boolean(opts.refreshScreenshots);
      if (opts.refreshSizes !== undefined) this.refreshSizes = Boolean(opts.refreshSizes);
      if (opts.refreshFiles !== undefined) this.refreshFiles = Boolean(opts.refreshFiles);
      console.log(`⚡ Configurações: Modo=${this.mode}, BufferLimit=${this.bufferLimit}, KnownPageLimit=${this.knownPageLimit}, MaxPáginas=${this.maxPages}, Concorrência=${this.concurrency}, RefreshScreenshots=${this.refreshScreenshots}, RefreshSizes=${this.refreshSizes}, RefreshFiles=${this.refreshFiles}`);
    }

    async sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    // Requisição de Página com Retry & Backoff Exponencial (1s, 2s, 4s)
    async fetchPageWithRetry(url, maxAttempts = 3) {
      let attempt = 0;
      const delays = [1000, 2000, 4000];

      while (attempt < maxAttempts) {
        attempt++;
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const buffer = await response.arrayBuffer();
          const decoder = new TextDecoder('windows-1251');
          const htmlText = decoder.decode(buffer);
          const parser = new DOMParser();
          return parser.parseFromString(htmlText, 'text/html');
        } catch (err) {
          console.warn(`⚠️ Tentativa ${attempt}/${maxAttempts} falhou para ${url}: ${err.message}`);
          if (attempt >= maxAttempts) {
            throw new Error(`Erro de rede/origem após ${maxAttempts} tentativas: ${err.message}`);
          }
          const backoff = delays[attempt - 1] || 4000;
          await this.sleep(backoff);
        }
      }
    }

    extractPaginationInfo(doc) {
      let maxStart = 0;
      const links = doc.querySelectorAll('a.pg, p a[href*="start="]');
      links.forEach(a => {
        const href = a.getAttribute('href') || '';
        const match = href.match(/start=(\d+)/);
        if (match) {
          const startVal = parseInt(match[1], 10);
          if (startVal > maxStart) maxStart = startVal;
        }
      });
      const totalPages = Math.floor(maxStart / 50) + 1;
      return { totalPages, maxStart };
    }

    async fetchTopicDetails(topicUrl, topicTitle = '') {
      try {
        const doc = await this.fetchPageWithRetry(topicUrl, 2);
        const postBody = doc.querySelector('.post_body');
        if (!postBody) return {};

        const titleExtract = extractCanonicalTitleFromDOM(postBody, topicTitle);
        const canonicalTitle = titleExtract.canonicalTitle;
        const canonicalTitleRaw = titleExtract.canonicalTitleRaw;
        const releaseGroup = titleExtract.releaseGroup;
        const normalizedTitle = normalizeTitleForDedupe(canonicalTitle);

        if (titleExtract.method === 'TITLE_CANONICAL_FALLBACK') {
          console.log(`[TITLE][FALLBACK] "${topicTitle}" -> "${canonicalTitle}"`);
        } else {
          console.log(`[TITLE][EXTRACT] [${titleExtract.method}] "${canonicalTitle}" (raw: "${canonicalTitleRaw}")`);
        }

        function isTrackerDecorationOrSmile(url) {
          if (!url || typeof url !== 'string') return true;
          const lower = url.toLowerCase();
          return lower.includes('smiles/') ||
                 lower.includes('tr_oops.gif') ||
                 lower.includes('broken_image_') ||
                 lower.includes('spacer.gif') ||
                 lower.includes('icon_') ||
                 lower.includes('rating') ||
                 lower.includes('static.rutracker');
        }

        function resolveRawImageUrl(url) {
          if (!url || typeof url !== 'string') return null;
          let clean = url.trim();
          if (!clean || isTrackerDecorationOrSmile(clean)) return null;

          if (clean.startsWith('http://')) {
            clean = clean.replace(/^http:\/\//i, 'https://');
          }

          if (clean.includes('fastpic.org/thumb/') || clean.includes('fastpic.ru/thumb/')) {
            clean = clean.replace(/\/thumb\//i, '/big/').replace('_thumb', '');
          }

          if (clean.includes('fastpic.org/fullview/') || clean.includes('fastpic.org/view/') || clean.includes('fastpic.ru/')) {
            const match = clean.match(/fastpic\.(?:org|ru)\/(?:fullview|view)\/(\d+)\/(\d+)\/(\d+)\/([^/.\s]+)/i);
            if (match) {
              const [, server, year, date, hash] = match;
              const sub = hash.slice(-2);
              const extMatch = clean.match(/\.(webp|png|gif|jpeg|jpg)\.html/i);
              const ext = extMatch ? extMatch[1] : 'jpg';
              return `https://i${server}.fastpic.org/big/${year}/${date}/${sub}/${hash}.${ext}`;
            }
          }

          if (clean.includes('imagebam.com/') && clean.includes('_t.')) {
            clean = clean.replace(/thumbs(\d+)?\.imagebam\.com/i, 'images$1.imagebam.com').replace(/_t\./i, '.');
          }

          if (clean.includes('imageban.ru/show/')) {
            const match = clean.match(/imageban\.ru\/show\/(\d+)\/(\d+)\/(\d+)\/([^/.\s]+)/i);
            if (match) {
              const [, year, month, day, hash] = match;
              return `https://i4.imageban.ru/out/${year}/${month}/${day}/${hash}.jpg`;
            }
            clean = clean.replace(/\/show\//i, '/out/').replace(/\/jpg$/i, '.jpg');
          }

          if (clean.includes('postimg.cc/') && !clean.includes('i.postimg.cc')) {
            clean = clean.replace(/postimg\.cc\//i, 'i.postimg.cc/') + '.jpg';
          }

          return clean;
        }

        let cover = null;
        const coverImg = postBody.querySelector('img.postImg.postImgAligned, img.img-right, img.postImgAligned');
        if (coverImg) {
          const rawCover = coverImg.getAttribute('src') || coverImg.getAttribute('data-src') || coverImg.closest('a')?.getAttribute('href');
          if (rawCover && !isTrackerDecorationOrSmile(rawCover)) {
            cover = resolveRawImageUrl(rawCover);
          }
        }
        if (!cover) {
          const cleanBody = postBody.cloneNode(true);
          cleanBody.querySelectorAll('.sp-wrap').forEach(el => el.remove());
          const firstVar = cleanBody.querySelector('var.postImg, var');
          if (firstVar && firstVar.getAttribute('title')) {
            const rawTitle = firstVar.getAttribute('title');
            if (rawTitle && !isTrackerDecorationOrSmile(rawTitle)) {
              cover = resolveRawImageUrl(rawTitle);
            }
          }
          if (!cover) {
            const candidateImgs = Array.from(cleanBody.querySelectorAll('img.postImg, img'));
            for (const img of candidateImgs) {
              const src = img.getAttribute('src') || img.getAttribute('data-src') || img.closest('a')?.getAttribute('href');
              if (src && !isTrackerDecorationOrSmile(src)) {
                cover = resolveRawImageUrl(src);
                if (cover) break;
              }
            }
          }
        }

        const screenshots = [];
        const seenScreenshotKeys = new Set();
        const screenshotSpWraps = Array.from(postBody.querySelectorAll('.sp-wrap'));

        // Sort exact 'Скриншоты' main groups first
        screenshotSpWraps.sort((a, b) => {
          const aText = (a.querySelector('.sp-head, .sp-tit')?.textContent || '').trim().toLowerCase();
          const bText = (b.querySelector('.sp-head, .sp-tit')?.textContent || '').trim().toLowerCase();
          const aExact = aText === 'скриншоты' || aText === 'скриншот' || aText === 'screenshots';
          const bExact = bText === 'скриншоты' || bText === 'скриншот' || bText === 'screenshots';
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });

        screenshotSpWraps.forEach(wrap => {
          const headText = (wrap.querySelector('.sp-head, .sp-tit')?.textContent || '').toLowerCase();
          if (headText.includes('скриншот') || headText.includes('screenshot') || headText.includes('снимок')) {
            const spBody = wrap.querySelector('.sp-body');
            if (!spBody) return;

            // 1. Process anchor-wrapped screenshots
            spBody.querySelectorAll('a').forEach(a => {
              const href = a.getAttribute('href') || '';
              const imgOrVar = a.querySelector('img, var');
              const src = imgOrVar ? (imgOrVar.getAttribute('src') || imgOrVar.getAttribute('data-src') || imgOrVar.getAttribute('title') || '') : '';
              
              const candidates = [href, src].filter(Boolean);
              for (const cand of candidates) {
                const resolved = resolveRawImageUrl(cand);
                if (resolved && !isTrackerDecorationOrSmile(resolved)) {
                  // Do not duplicate cover in screenshots
                  if (cover && resolved === cover) continue;
                  const dedupeKey = resolved.replace(/^https?:\/\//i, '').replace(/\.(jpe?g|png|webp|gif)$/i, '');
                  if (!seenScreenshotKeys.has(dedupeKey)) {
                    seenScreenshotKeys.add(dedupeKey);
                    screenshots.push(resolved);
                    break;
                  }
                }
              }
            });

            // 2. Process direct images not wrapped in anchors
            spBody.querySelectorAll('img.postImg, var.postImg, img').forEach(el => {
              if (!el.closest('a')) {
                const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('title') || '';
                const resolved = resolveRawImageUrl(src);
                if (resolved && !isTrackerDecorationOrSmile(resolved)) {
                  if (cover && resolved === cover) return;
                  const dedupeKey = resolved.replace(/^https?:\/\//i, '').replace(/\.(jpe?g|png|webp|gif)$/i, '');
                  if (!seenScreenshotKeys.has(dedupeKey)) {
                    seenScreenshotKeys.add(dedupeKey);
                    screenshots.push(resolved);
                  }
                }
              }
            });
          }
        });

        let magnet = null;
        const magnetLink = doc.querySelector('a.magnet-link, a[href^="magnet:?"]');
        if (magnetLink) {
          magnet = magnetLink.getAttribute('href');
        }
        const infoHash = extractBTIH(magnet);

        let fileList = null;
        postBody.querySelectorAll('.sp-wrap').forEach(wrap => {
          const headText = (wrap.querySelector('.sp-head, .sp-tit')?.textContent || '').toLowerCase();
          if (headText.includes('список файлов') || headText.includes('файлы в раздаче') || headText.includes('файлы')) {
            fileList = (wrap.querySelector('.sp-body')?.textContent || '').trim();
          }
        });

        const keyMap = {
          releaseYear: ['год выпуска', 'год выхода', 'дата выпуска', 'дата выхода', 'год релиза', 'год'],
          genre: ['жанр'],
          developer: ['разработчик', 'разработчики'],
          publisher: ['издатель', 'издательство', 'издатель в россии'],
          imageFormat: ['формат образа', 'формат дампа', 'формат игры', 'формат файла', 'формат', 'тип файлов', 'тип образа', 'вид раздачи'],
          multiplayer: ['мультиплеер игры', 'мультиплейер игры', 'мультиплеер', 'мультиплейер', 'сетевой режим'],
          interfaceLanguage: ['язык интерфейса', 'язык интерфейса игры', 'язык интерфейса/титров', 'языки интерфейса', 'язык'],
          voiceLanguage: ['язык озвучки', 'озвучка', 'языки озвучки'],
          version: ['версия игры', 'версия', 'версия прошивки', 'патч / версия', 'патч'],
          region: ['регион', 'регион игры', 'region'],
          size: ['размер']
        };

        const meta = {
          releaseYear: null,
          genre: null,
          developer: null,
          publisher: null,
          imageFormat: null,
          multiplayer: null,
          interfaceLanguage: null,
          voiceLanguage: null,
          version: null,
          region: null,
          size: null
        };

        const keyNodes = postBody.querySelectorAll('.post-b, b');
        keyNodes.forEach(node => {
          const keyLabel = (node.textContent || '').trim().toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
          for (const [field, keywords] of Object.entries(keyMap)) {
            if (meta[field]) continue;
            if (keywords.includes(keyLabel)) {
              let valText = '';
              let curr = node.nextSibling;
              while (curr) {
                if (curr.nodeType === 1 && (curr.classList?.contains('post-b') || curr.tagName === 'B' || curr.tagName === 'BR' || curr.classList?.contains('post-br'))) {
                  break;
                }
                valText += curr.textContent || '';
                curr = curr.nextSibling;
              }
              const cleaned = cleanText(valText);
              if (cleaned) meta[field] = cleaned;
            }
          }
        });

        const postText = postBody.textContent || '';
        if (!meta.releaseYear) {
          const m = postText.match(/(?:Год\s+выпуска|Год\s+выхода|Дата\s+выпуска|Дата\s+выхода|Год)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.releaseYear = cleanText(m[1]);
        }
        if (!meta.genre) {
          const m = postText.match(/Жанр\s*:\s*([^\n\r<]+)/i);
          if (m) meta.genre = cleanText(m[1]);
        }
        if (!meta.developer) {
          const m = postText.match(/Разработчик\s*:\s*([^\n\r<]+)/i);
          if (m) meta.developer = cleanText(m[1]);
        }
        if (!meta.publisher) {
          const m = postText.match(/(?:Издатель|Издательство)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.publisher = cleanText(m[1]);
        }
        if (!meta.imageFormat) {
          const m = postText.match(/(?:Формат\s+образа|Формат\s+дампа|Формат\s+игры|Формат)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.imageFormat = cleanText(m[1]);
        }
        if (!meta.multiplayer) {
          const m = postText.match(/(?:Мультипле[йя]р(?:\s+игры)?)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.multiplayer = cleanText(m[1]);
        }
        if (!meta.interfaceLanguage) {
          const m = postText.match(/(?:Язык\s+интерфейса|Язык)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.interfaceLanguage = cleanText(m[1]);
        }
        if (!meta.voiceLanguage) {
          const m = postText.match(/(?:Язык\s+озвучки|Озвучка)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.voiceLanguage = cleanText(m[1]);
        }
        if (!meta.version) {
          const m = postText.match(/(?:Версия\s+игры|Версия)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.version = cleanText(m[1]);
        }
        if (!meta.region) {
          const m = postText.match(/(?:Регион(?:\s+игры)?)\s*:\s*([^\n\r<]+)/i);
          if (m) meta.region = cleanText(m[1]);
        }
        if (!meta.size) {
          const m = postText.match(/Размер\s*:\s*([0-9\.,]+\s*(?:GB|MB|KB|ГБ|МБ|КБ))/i) || postText.match(/(\d+[\.,]\d+\s*(?:GB|MB|KB))/i);
          if (m) meta.size = cleanText(m[1]);
        }

        const normMeta = normalizeItemMetadata({
          title: topicTitle,
          topicTitle,
          canonicalTitle,
          genre: meta.genre,
          developer: meta.developer,
          publisher: meta.publisher,
          releaseYear: meta.releaseYear,
          version: meta.version,
          interfaceLanguage: meta.interfaceLanguage,
          voiceLanguage: meta.voiceLanguage,
          language: meta.interfaceLanguage,
          imageFormat: meta.imageFormat,
          multiplayer: meta.multiplayer,
          region: meta.region,
        });

        return {
          canonicalTitle,
          canonicalTitleRaw,
          normalizedTitle,
          releaseGroup,
          infoHash,
          cover,
          screenshots,
          magnet,
          fileList,
          size: meta.size,
          ...meta,
          ...normMeta,
        };

      } catch (err) {
        return {};
      }
    }

    extractTopicsFromDoc(doc, category, pageNum, pageUrl) {
      const topics = [];
      const links = doc.querySelectorAll('a.torTopic');

      links.forEach(el => {
        const title = el.textContent.trim();
        const href = el.getAttribute('href') || '';

        const matchesTitle = !category.titleSearch ||
          (Array.isArray(category.titleSearch)
            ? category.titleSearch.some(term => title.toLowerCase().includes(term.toLowerCase()))
            : title.toLowerCase().includes(category.titleSearch.toLowerCase()));

        if (title && matchesTitle && href) {
          const topicIdMatch = href.match(/t=(\d+)/);
          const topicId = topicIdMatch ? topicIdMatch[1] : null;

          if (topicId) {
            const fullUrl = href.startsWith('http') 
              ? href 
              : `https://rutracker.org/forum/${href.startsWith('/') ? href.substring(1) : href}`;

            topics.push({
              id: `topic_${topicId}`,
              topicId,
              title,
              url: fullUrl,
              category: category.id,
              source: {
                site: 'rutracker',
                forumId: category.baseUrl.match(/f=(\d+)/)?.[1] || category.id,
                forumName: category.name,
                category: category.id,
                categoryName: category.name,
                categoryUrl: category.baseUrl,
                page: pageNum,
                pageOffset: (pageNum - 1) * 50,
                pageUrl
              }
            });
          }
        }
      });

      return topics;
    }

    async start(options = {}) {
      if (this.isRunning) {
        console.log('⚠️ Scraper já está em execução!');
        return;
      }

      if (options.bufferLimit !== undefined) this.bufferLimit = options.bufferLimit;
      if (options.knownPageLimit !== undefined && options.knownPageLimit > 0) this.knownPageLimit = options.knownPageLimit;
      if (options.maxPages) this.maxPages = options.maxPages;

      const plan = createExecutionPlan({
        ...options,
        category: this.targetCategory || options.category,
        mode: options.mode || this.mode,
        full: this.mode === 'full' || options.mode === 'full' || options.full,
        refreshScreenshots: options.refreshScreenshots !== undefined ? options.refreshScreenshots : this.refreshScreenshots,
        refreshSizes: options.refreshSizes !== undefined ? options.refreshSizes : this.refreshSizes,
        refreshFiles: options.refreshFiles !== undefined ? options.refreshFiles : this.refreshFiles,
        knownPageLimit: this.knownPageLimit,
      });

      this.mode = plan.mode;
      this.refreshScreenshots = plan.refresh.images;
      this.refreshSizes = plan.refresh.size;
      this.refreshFiles = plan.refresh.files;
      this.isRunning = true;

      console.log(`[SCRAPER][PLAN] scope=${plan.scope.type} target=${plan.scope.targetCategoryId || 'all'} mode=${plan.mode} images=${plan.refresh.images} size=${plan.refresh.size} files=${plan.refresh.files} scanAllPages=${plan.scanAllPages} scanAllCategories=${plan.scanAllCategories} earlyStop=${plan.allowKnownTopicEarlyStop} threshold=${plan.allowKnownTopicEarlyStop ? plan.knownPageLimit : 'disabled'}`);
      console.log(`⚡ Parâmetros: KnownPageLimit=${plan.allowKnownTopicEarlyStop ? plan.knownPageLimit : 'Desativado (Varredura de Todas as Páginas)'}, MaxPáginas=${this.maxPages}, Concorrência=${this.concurrency}`);

      const sessionStats = {
        startedAt: new Date().toISOString(),
        totalCategories: 0,
        totalNewItems: 0,
        totalExistingUpdated: 0,
        totalSkippedUnknown: 0,
        totalPagesRead: 0,
        totalPagesSkipped: 0,
        totalTopicDetailsFetched: 0,
      };

      const enabledList = CATEGORIES.filter((c) => c.enabled !== false);
      const totalCategoriesCount = plan.scanAllCategories ? enabledList.length : 1;

      for (let i = 0; i < CATEGORIES.length; i++) {
        if (!this.isRunning) break;

        const category = CATEGORIES[i];
        if (category.enabled === false) continue;
        if (!plan.scanAllCategories && this.targetCategory && category.id !== this.targetCategory) continue;

        // Invariant assertion: In single category scope, do not process any other category
        if (!plan.scanAllCategories && this.targetCategory && category.id !== this.targetCategory) {
          throw new Error(`[SCRAPER][INVARIANT_VIOLATION] Attempted to process category "${category.id}" in single-category scope "${this.targetCategory}".`);
        }

        const catStartedAt = new Date().toISOString();
        this.currentCategory = category.id;
        this.progress = {
          category: category.id,
          categoryName: category.name,
          currentPage: 0,
          totalPages: 0,
          processedItems: 0,
          newItems: 0,
          totalItems: sessionStats.totalNewItems,
        };
        if (typeof window.__rtScraperProgress === 'function') {
          try { window.__rtScraperProgress(this.progress); } catch (_) {}
        }

        console.log(`\n============================================================`);
        console.log(`🎮 [${plan.scanAllCategories ? (i + 1) + '/' + CATEGORIES.length : '1/1'}] Categoria: ${category.name} (${category.id}) [Modo: ${plan.mode.toUpperCase()}]`);
        console.log(`============================================================`);

        let catData = await this.store.getCategory(category.id);

        if (!catData) {
          catData = {
            id: category.id,
            schemaVersion: 2,
            category: { id: category.id, name: category.name, forumId: category.baseUrl.match(/f=(\d+)/)?.[1] || category.id, url: category.baseUrl },
            scraping: { startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'running', currentPage: 0, totalPages: 0, rawItems: 0, uniqueItems: 0, deduplicated: false },
            items: []
          };
        }

        const existingTopicIds = new Set(catData.items.map(it => it.topicId));

        let catNewItems = 0;
        let catExistingItems = 0;
        let pagesVisited = 0;
        let pagesSkipped = 0;
        let pagesWithNewItems = 0;
        let topicDetailsFetched = 0;
        let consecutiveKnownPages = 0;
        let stopReason = 'concluido';
        let status = 'ok';

        try {
          const p1Url = category.baseUrl;
          console.log(`📄 Carregando Página 1: ${p1Url}`);
          
          const p1Doc = await this.fetchPageWithRetry(p1Url, 3);
          const { totalPages: totalPagesDiscovered } = this.extractPaginationInfo(p1Doc);
          
          const totalPages = Math.min(totalPagesDiscovered, this.maxPages);
          catData.scraping.totalPages = totalPages;
          console.log(`📊 totalPages detectado para ${category.name}: ${totalPagesDiscovered} páginas (Limite máximo: ${totalPages})`);

          if (totalPagesDiscovered > this.maxPages && plan.mode === 'refresh') {
            catData.scraping.status = 'partial';
            console.warn(`[SCRAPER][WARNING] MAX_PAGES_LIMIT_REACHED: Category ${category.name} has ${totalPagesDiscovered} pages, limited to ${this.maxPages} by safety cap.`);
          }

          this.progress = {
            category: category.id,
            categoryName: category.name,
            currentPage: 0,
            totalPages,
            processedItems: catData.items.length,
            newItems: catNewItems,
            totalItems: sessionStats.totalNewItems,
          };
          if (typeof window.__rtScraperProgress === 'function') {
            try { window.__rtScraperProgress(this.progress); } catch (_) {}
          }

          let shouldStopCategory = false;

          for (let page = 1; page <= totalPages; page++) {
            if (!this.isRunning || shouldStopCategory) break;

            pagesVisited++;
            const startOffset = (page - 1) * 50;
            const pageUrl = page === 1 ? category.baseUrl : `${category.baseUrl}&start=${startOffset}`;
            const startTimePage = Date.now();

            const doc = page === 1 ? p1Doc : await this.fetchPageWithRetry(pageUrl, 3);
            const rawTopics = this.extractTopicsFromDoc(doc, category, page, pageUrl);

            // 1. Tratamento de segurança contra falsos positivos: página vazia inesperada
            if (!rawTopics || rawTopics.length === 0) {
              if (plan.mode === 'refresh') {
                console.warn(`[SCRAPER][PAGE] ${category.name} Page ${page}/${totalPages} Topics=0 Existing=0 UnknownSkipped=0 Action=PAGE_PARSE_EMPTY`);
                continue;
              } else {
                console.warn(`[SCRAPER][PAGE] ${category.name} Page ${page}/${totalPages} Topics=0 New=0 Existing=0 KnownPages=${consecutiveKnownPages}/${plan.knownPageLimit} Action=PAGE_PARSE_EMPTY`);
                continue;
              }
            }

            // 2. Deduplicação de tópicos na própria página
            const pageTopicsMap = new Map();
            for (const topic of rawTopics) {
              if (topic && topic.topicId && !pageTopicsMap.has(topic.topicId)) {
                pageTopicsMap.set(topic.topicId, topic);
              }
            }
            const uniquePageTopics = Array.from(pageTopicsMap.values());
            const topicsOnPage = uniquePageTopics.length;

            // 3. Comparação única por topicId com o Set de conhecidos
            const existingTopics = [];
            const newTopics = [];
            for (const topic of uniquePageTopics) {
              if (existingTopicIds.has(topic.topicId)) {
                existingTopics.push(topic);
              } else {
                newTopics.push(topic);
              }
            }

            if (plan.mode === 'refresh') {
              // MODO REFRESH: Processa SOMENTE itens existentes e NUNCA usa early stop por conhecidos
              console.log(`[SCRAPER][PAGE] ${category.name} Page ${page}/${totalPages} Topics=${topicsOnPage} Existing=${existingTopics.length} UnknownSkipped=${newTopics.length} Action=REFRESH_EXISTING_ONLY`);

              for (const unknownTopic of newTopics) {
                console.log(`[SCRAPER][REFRESH][SKIP_UNKNOWN_TOPIC] topicId=${unknownTopic.topicId} category=${category.id}`);
                sessionStats.totalSkippedUnknown++;
              }

              const existingMap = new Map(catData.items.map(it => [it.topicId, it]));
              const topicsToFetch = [...existingTopics];

              const workers = Array.from({ length: Math.min(this.concurrency, topicsToFetch.length) }, async () => {
                while (topicsToFetch.length > 0 && this.isRunning) {
                  const topic = topicsToFetch.shift();
                  if (!topic) break;

                  if (this.delayTopicMs > 0) await this.sleep(this.delayTopicMs);
                  try {
                    const details = await this.fetchTopicDetails(topic.url, topic.title);
                    const now = new Date().toISOString();
                    topicDetailsFetched++;

                    const existingItem = existingMap.get(topic.topicId);
                    if (existingItem) {
                      if (plan.refresh.images) {
                        existingItem.cover = details.cover || existingItem.cover;
                        existingItem.screenshots = details.screenshots || existingItem.screenshots;
                        if (!existingItem.content) existingItem.content = {};
                        existingItem.content.cover = details.cover || existingItem.content.cover;
                        existingItem.content.screenshots = details.screenshots || existingItem.content.screenshots;
                      }
                      if (plan.refresh.size) {
                        existingItem.size = details.size || existingItem.size;
                        if (!existingItem.content) existingItem.content = {};
                        existingItem.content.size = details.size || existingItem.content.size;
                      }
                      if (plan.refresh.files) {
                        existingItem.fileList = details.fileList || existingItem.fileList;
                        if (!existingItem.content) existingItem.content = {};
                        existingItem.content.fileList = details.fileList || existingItem.content.fileList;
                      }
                      if (existingItem.scraping) {
                        existingItem.scraping.updatedAt = now;
                      }
                      console.log(`[SCRAPER][REFRESH] topic=${topic.topicId} exists=true images=${plan.refresh.images ? 'updated' : 'skip'} size=${plan.refresh.size ? 'updated' : 'skip'} files=${plan.refresh.files ? 'updated' : 'skip'}`);
                      catExistingItems++;
                      sessionStats.totalExistingUpdated++;
                    }
                  } catch (topicErr) {
                    console.warn(`[SCRAPER][REFRESH][WARN] Failed to refresh topic ${topic.topicId}: ${topicErr.message}`);
                  }
                }
              });

              await Promise.all(workers);

            } else {
              // MODO FULL SCAN ou INCREMENTAL
              catExistingItems += existingTopics.length;

              if (newTopics.length === 0) {
                consecutiveKnownPages++;
                pagesSkipped++;
                console.log(`[SCRAPER][PAGE] ${category.name} Page ${page}/${totalPages} Topics=${topicsOnPage} New=0 Existing=${existingTopics.length} KnownPages=${consecutiveKnownPages}/${plan.knownPageLimit} Action=SKIP_DETAILS`);

                if (shouldStopAfterPage({ plan, consecutiveKnownPages })) {
                  console.log(`🛑 Limite de ${plan.knownPageLimit} páginas conhecidas consecutivas atingido para ${category.name}. Encerrando categoria.`);
                  stopReason = 'known_pages_limit';
                  shouldStopCategory = true;
                  break;
                }
              } else {
                consecutiveKnownPages = 0; // Reset do contador por descoberta de novos tópicos
                pagesWithNewItems++;
                console.log(`[SCRAPER][PAGE] ${category.name} Page ${page}/${totalPages} Topics=${topicsOnPage} New=${newTopics.length} Existing=${existingTopics.length} Action=${plan.mode === 'full' ? 'FULL_SCAN_PROCESS_ALL' : 'PROCESS_NEW'}`);

                const existingMap = new Map(catData.items.map(it => [it.topicId, it]));
                const topicsToFetch = plan.mode === 'full' ? [...uniquePageTopics] : [...newTopics];

                const workers = Array.from({ length: Math.min(this.concurrency, topicsToFetch.length) }, async () => {
                  while (topicsToFetch.length > 0 && this.isRunning) {
                    const topic = topicsToFetch.shift();
                    if (!topic) break;

                    if (this.delayTopicMs > 0) await this.sleep(this.delayTopicMs);
                    try {
                      const details = await this.fetchTopicDetails(topic.url, topic.title);
                      const now = new Date().toISOString();
                      topicDetailsFetched++;

                      const existingItem = existingMap.get(topic.topicId);

                      if (existingItem) {
                        if (plan.refresh.images || plan.mode === 'full') {
                          existingItem.cover = details.cover || existingItem.cover;
                          existingItem.screenshots = details.screenshots || existingItem.screenshots;
                          if (!existingItem.content) existingItem.content = {};
                          existingItem.content.cover = details.cover || existingItem.content.cover;
                          existingItem.content.screenshots = details.screenshots || existingItem.content.screenshots;
                        }
                        if (plan.refresh.size || plan.mode === 'full') {
                          existingItem.size = details.size || existingItem.size;
                          if (!existingItem.content) existingItem.content = {};
                          existingItem.content.size = details.size || existingItem.content.size;
                        }
                        if (plan.refresh.files || plan.mode === 'full') {
                          existingItem.fileList = details.fileList || existingItem.fileList;
                          if (!existingItem.content) existingItem.content = {};
                          existingItem.content.fileList = details.fileList || existingItem.content.fileList;
                        }
                        if (existingItem.scraping) {
                          existingItem.scraping.updatedAt = now;
                        }
                      } else {
                        existingTopicIds.add(topic.topicId);
                        catNewItems++;

                        const fullItem = {
                          id: topic.id,
                          topicId: topic.topicId,
                          title: details.canonicalTitle || topic.title,
                          topicTitle: topic.title,
                          canonicalTitle: details.canonicalTitle || topic.title,
                          canonicalTitleRaw: details.canonicalTitleRaw || topic.title,
                          normalizedTitle: details.normalizedTitle || normalizeTitleForDedupe(details.canonicalTitle || topic.title),
                          releaseGroup: details.releaseGroup || null,
                          infoHash: details.infoHash || null,
                          url: topic.url,
                          version: details.version || undefined,
                          genre: details.genre || undefined,
                          developer: details.developer || undefined,
                          publisher: details.publisher || undefined,
                          imageFormat: details.imageFormat || undefined,
                          multiplayer: details.multiplayer || undefined,
                          interfaceLanguage: details.interfaceLanguage || details.language || undefined,
                          voiceLanguage: details.voiceLanguage || undefined,
                          language: details.interfaceLanguage || details.language || undefined,
                          releaseYear: details.releaseYear || undefined,
                          source: topic.source,
                          content: {
                            cover: details.cover || null,
                            screenshots: details.screenshots || [],
                            magnet: details.magnet || null,
                            size: details.size || null,
                            sizeBytes: null,
                            fileList: details.fileList || null
                          },
                          scraping: {
                            discoveredAt: now,
                            scrapedAt: now,
                            updatedAt: now,
                            status: 'complete',
                            attempts: 1,
                            lastError: null
                          },
                          category: topic.category,
                          scrapedAt: now,
                          cover: details.cover || null,
                          screenshots: details.screenshots || [],
                          magnet: details.magnet || null,
                          size: details.size || null,
                          developer: details.developer || null,
                          publisher: details.publisher || null,
                          imageFormat: details.imageFormat || null,
                          multiplayer: details.multiplayer || null,
                          voiceLanguage: details.voiceLanguage || null,
                          interfaceLanguage: details.interfaceLanguage || details.language || null,
                          fileList: details.fileList || null
                        };

                        catData.items.push(fullItem);
                        existingMap.set(topic.topicId, fullItem);
                      }
                    } catch (topicErr) {
                      console.warn(`[SCRAPER][WARN] Failed to process topic ${topic.topicId}: ${topicErr.message}`);
                    }
                  }
                });

                await Promise.all(workers);
              }
            }

            const pageSecs = ((Date.now() - startTimePage) / 1000).toFixed(1);
            console.log(`📖 [${category.name}] Pág ${page}/${totalPages} em ${pageSecs}s | Novos: ${catNewItems}, Existentes: ${catExistingItems} | Conhecidas: ${consecutiveKnownPages}/${plan.knownPageLimit} | Total: ${catData.items.length}`);

            catData.scraping.currentPage = page;
            catData.scraping.currentOffset = startOffset;
            catData.scraping.rawItems = catData.items.length;
            catData.scraping.updatedAt = new Date().toISOString();
            await this.store.saveCategory(catData);

            this.progress = {
              category: category.id,
              categoryName: category.name,
              currentPage: page,
              totalPages,
              processedItems: catData.items.length,
              newItems: catNewItems,
              totalItems: sessionStats.totalNewItems + catNewItems,
            };
            if (typeof window.__rtScraperProgress === 'function') {
              try { window.__rtScraperProgress(this.progress); } catch (_) {}
            }

            if (page >= this.maxPages && page < totalPagesDiscovered && !shouldStopCategory) {
              console.log(`🛑 Limite máximo de páginas (${this.maxPages}) atingido para ${category.name}.`);
              stopReason = 'max_paginas';
              break;
            }

            if (page < totalPages && this.delayPageMs > 0 && !shouldStopCategory) {
              await this.sleep(this.delayPageMs);
            }
          }

          // Consolidação e Deduplicação Final da Categoria
          if (catData.items.length > 0) {
            const uniqueMap = new Map();
            catData.items.forEach(item => {
              if (!uniqueMap.has(item.topicId)) {
                uniqueMap.set(item.topicId, item);
              }
            });

            catData.items = Array.from(uniqueMap.values());
            catData.scraping.uniqueItems = catData.items.length;
            if (catData.scraping.status !== 'partial') {
              catData.scraping.status = 'complete';
            }
            catData.scraping.deduplicated = true;
            catData.scraping.completedAt = new Date().toISOString();
            catData.scraping.updatedAt = new Date().toISOString();

            await this.store.saveCategory(catData);
          }

          console.log(`\n📊 Resumo da Categoria [${category.name}]:`);
          console.log(`   Pages visited:          ${pagesVisited}`);
          console.log(`   Pages skipped:          ${pagesSkipped}`);
          console.log(`   Pages with new items:   ${pagesWithNewItems}`);
          console.log(`   New items:              ${catNewItems}`);
          console.log(`   Existing items:         ${catExistingItems}`);
          console.log(`   Topic details fetched:  ${topicDetailsFetched}`);
          console.log(`✅ Categoria ${category.name} Concluída! Motivo: ${stopReason.toUpperCase()} | Novos Salvos: ${catNewItems} | Total Único: ${catData.items.length}`);

        } catch (err) {
          console.error(`❌ Erro ao processar categoria ${category.name}:`, err.message);
          status = err.message.includes('rede') ? 'erro_rede' : 'parcial';
          stopReason = 'erro_rede';
          catData.scraping.status = 'failed';
          catData.scraping.lastError = err.message;
          await this.store.saveCategory(catData);
        }

        // Registra Tabela de Auditoria
        const catEndedAt = new Date().toISOString();
        await this.store.saveAuditLog({
          id: `audit_${Date.now()}_${category.id}`,
          categoryId: category.id,
          categoryName: category.name,
          modo: this.mode,
          iniciada_em: catStartedAt,
          finalizada_em: catEndedAt,
          paginas_lidas: pagesVisited,
          pagesVisited,
          pagesSkipped,
          pagesWithNewItems,
          newItems: catNewItems,
          existingItems: catExistingItems,
          topicDetailsFetched,
          status,
          motivoTermino: stopReason
        });

        sessionStats.totalCategories++;
        sessionStats.totalNewItems += catNewItems;
        sessionStats.totalPagesRead += pagesVisited;
        sessionStats.totalPagesSkipped += pagesSkipped;
        sessionStats.totalTopicDetailsFetched += topicDetailsFetched;
      }

      this.isRunning = false;
      console.log(`\n============================================================`);
      console.log(`🎉 EXECUÇÃO CONCLUÍDA [Modo: ${this.mode.toUpperCase()}]`);
      console.log(`============================================================`);
      console.log(` Categorias processadas:        ${sessionStats.totalCategories}`);
      console.log(` Páginas lidas totais:          ${sessionStats.totalPagesRead}`);
      console.log(` Páginas puladas (conhecidas):  ${sessionStats.totalPagesSkipped}`);
      console.log(` Novos itens salvos:            ${sessionStats.totalNewItems}`);
      console.log(` Detalhes de tópicos buscados:  ${sessionStats.totalTopicDetailsFetched}`);
      console.log(`============================================================`);
      console.log(`Execute EcoHubScraper.getAuditLogs() para ver a auditoria de execuções.`);
      console.log(`Execute EcoHubScraper.downloadAll() para exportar os arquivos JSON.`);
    }

    startFull() {
      return this.start({ mode: 'full' });
    }

    refreshAllScreenshots(options = {}) {
      return this.start({ ...options, refreshScreenshots: true });
    }

    refreshAllSizes(options = {}) {
      return this.start({ ...options, refreshSizes: true });
    }

    refreshAllFileLists(options = {}) {
      return this.start({ ...options, refreshFiles: true });
    }

    stop() {
      this.isRunning = false;
      console.log('⏹️ Scraper pausado. Execute EcoHubScraper.start() para retomar.');
    }

    async getAuditLogs() {
      const logs = await this.store.getAuditLogs();
      console.table(logs);
      return logs;
    }

    async resetEmptyCategories() {
      const all = await this.store.getAllCategories();
      let resetCount = 0;

      for (const catData of all) {
        if (!catData.items || catData.items.length === 0 || catData.scraping.status === 'failed') {
          catData.items = [];
          catData.scraping.currentPage = 0;
          catData.scraping.status = 'running';
          catData.scraping.deduplicated = false;
          await this.store.saveCategory(catData);
          resetCount++;
          console.log(`🔄 Categoria vazia resetada: ${catData.id}`);
        }
      }

      console.log(`✅ ${resetCount} categoria(s) vazia(s) resetada(s) com sucesso.`);
    }

    async resetCategory(categoryId) {
      const catData = await this.store.getCategory(categoryId);
      if (catData) {
        catData.items = [];
        catData.scraping.currentPage = 0;
        catData.scraping.status = 'running';
        catData.scraping.deduplicated = false;
        await this.store.saveCategory(catData);
        console.log(`🔄 Categoria '${categoryId}' resetada com sucesso.`);
      }
    }

    async clearStorage() {
      await this.store.clear();
      console.log('🗑️ Banco IndexedDB e tabela de auditoria limpos com sucesso.');
    }

    triggerDownload(filename, content) {
      const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    async downloadCategory(id) {
      const catData = await this.store.getCategory(id);
      if (!catData) {
        console.warn(`⚠️ Nenhum dado encontrado para a categoria ${id}`);
        return;
      }
      this.triggerDownload(`${id}.json`, catData);
      console.log(`💾 Download concluído: ${id}.json`);
    }

    async downloadBackup(categoryId) {
      if (typeof categoryId === 'string' && categoryId.trim().length > 0) {
        console.log(`ℹ️ Redirecionando para downloadCategory('${categoryId}')...`);
        return this.downloadCategory(categoryId.trim());
      }
      const all = await this.store.getAllCategories();
      if (!all || all.length === 0) {
        console.warn('⚠️ Nenhum dado encontrado no IndexedDB para exportar.');
        return;
      }
      const dateStr = new Date().toISOString().slice(0, 10);
      this.triggerDownload(`ecohub-full-backup-${dateStr}.json`, all);
      console.log(`💾 Backup completo baixado: ecohub-full-backup-${dateStr}.json`);
    }

    async downloadAll() {
      const all = await this.store.getAllCategories();
      if (!all || all.length === 0) {
        console.warn('⚠️ Nenhum dado encontrado no IndexedDB para exportar.');
        return;
      }

      console.log(`📦 Baixando ${all.length} arquivos JSON de categoria...`);
      for (const catData of all) {
        this.triggerDownload(`${catData.id}.json`, catData);
        await this.sleep(300);
      }
      console.log('✅ Todos os arquivos baixados com sucesso!');
    }

    async exportAll() {
      return await this.store.getAllCategories();
    }

    async getState() {
      const all = await this.store.getAllCategories();
      return {
        running: !!this.isRunning,
        mode: this.mode || 'incremental',
        categoriesStored: all.length,
        currentCategory: this.currentCategory || null,
        progress: this.progress || null,
      };
    }

    async waitUntilIdle(timeoutMs = 7200000) {
      const start = Date.now();
      while (this.isRunning) {
        if (Date.now() - start > timeoutMs) {
          throw new Error(`waitUntilIdle timed out after ${timeoutMs}ms`);
        }
        await this.sleep(500);
      }
      return true;
    }

    async importBackup() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.multiple = true;
        input.onchange = async (e) => {
          const files = Array.from(e.target.files);
          if (files.length === 0) return resolve(0);

          let restoredCount = 0;
          console.log(`📥 Processando ${files.length} arquivo(s) selecionado(s)...`);

          for (const file of files) {
            try {
              const text = await file.text();
              const parsed = JSON.parse(text);

              if (Array.isArray(parsed)) {
                for (const catData of parsed) {
                  if (catData && catData.id) {
                    await this.store.saveCategory(catData);
                    restoredCount++;
                    console.log(`   ✓ Categoria restaurada: ${catData.id} (${catData.items?.length || 0} itens)`);
                  }
                }
              } else if (parsed && parsed.id) {
                await this.store.saveCategory(parsed);
                restoredCount++;
                console.log(`   ✓ Categoria restaurada: ${parsed.id} (${parsed.items?.length || 0} itens)`);
              } else if (typeof parsed === 'object') {
                for (const key of Object.keys(parsed)) {
                  const item = parsed[key];
                  if (item && item.id) {
                    await this.store.saveCategory(item);
                    restoredCount++;
                    console.log(`   ✓ Categoria restaurada: ${item.id} (${item.items?.length || 0} itens)`);
                  }
                }
              }
            } catch (err) {
              console.error(`❌ Erro ao importar arquivo ${file.name}:`, err.message);
            }
          }

          console.log(`✅ IMPORTAÇÃO CONCLUÍDA! ${restoredCount} categoria(s) restaurada(s) no IndexedDB.`);
          resolve(restoredCount);
        };
        input.click();
      });
    }
  }

  if (typeof window !== 'undefined') {
    window.EcoHubScraper = new Scraper();
    console.log('⚡ EcoHubScraper Incremental Inteligente Carregado!');
    console.log('Comandos disponíveis no console:');
    console.log('  • EcoHubScraper.start()                 -> Iniciar Coleta Incremental Inteligente (padrão)');
    console.log('  • EcoHubScraper.startFull()             -> Iniciar Coleta FULL (ignora parada por buffer)');
    console.log('  • EcoHubScraper.downloadCategory("xbox") -> Baixar o arquivo .json de uma categoria');
    console.log('  • EcoHubScraper.downloadAll()             -> Baixar os arquivos .json de TODAS as categorias');
    console.log('  • EcoHubScraper.downloadBackup()          -> Baixar 1 arquivo consolidado de backup');
    console.log('  • EcoHubScraper.getAuditLogs()          -> Exibir tabela de auditoria de execuções');
    console.log('  • EcoHubScraper.setOptions({ knownPageLimit: 3, maxPages: 144 })');
  }

  if (typeof module !== 'undefined') {
    CATEGORIES.Scraper = Scraper;
    CATEGORIES.DBStore = DBStore;
    CATEGORIES.CATEGORIES = CATEGORIES;
    CATEGORIES.resolveExecutionScope = resolveExecutionScope;
    CATEGORIES.normalizeScraperOptions = normalizeScraperOptions;
    CATEGORIES.createExecutionPlan = createExecutionPlan;
    CATEGORIES.shouldStopAfterPage = shouldStopAfterPage;
    module.exports = CATEGORIES;
  }
})();
