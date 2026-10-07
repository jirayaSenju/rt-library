const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createScraperEnvironment() {
  const scriptPath = path.resolve(__dirname, 'console.js');
  const code = fs.readFileSync(scriptPath, 'utf8');

  const logs = [];
  const sandbox = {
    console: {
      log: (...args) => logs.push({ level: 'log', text: args.join(' ') }),
      warn: (...args) => logs.push({ level: 'warn', text: args.join(' ') }),
      error: (...args) => logs.push({ level: 'error', text: args.join(' ') }),
      table: () => {},
    },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Array,
    Set,
    Map,
    Promise,
    JSON,
    TextDecoder,
    window: {},
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const scraper = sandbox.window.EcoHubScraper;
  return { scraper, logs, sandbox };
}

function mockDocWithTopics(topicIds) {
  return {
    querySelectorAll: (selector) => {
      if (selector === 'a.pg, p a[href*="start="]') {
        return [];
      }
      if (selector === 'a.torTopic') {
        return topicIds.map((tid, idx) => ({
          textContent: `Game Title ${tid} [XBOX]`,
          getAttribute: (attr) => (attr === 'href' ? `viewtopic.php?t=${tid}` : ''),
        }));
      }
      return [];
    },
  };
}

test('1. Página 100% conhecida -> nenhum detail fetch (SKIP_DETAILS)', async () => {
  const { scraper, logs } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0, knownPageLimit: 3 });

  // Pre-seed category in store with topics 101 to 105
  await scraper.store.saveCategory({
    id: 'xbox',
    schemaVersion: 2,
    category: { id: 'xbox', name: 'Original Xbox', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' },
    scraping: { startedAt: new Date().toISOString(), status: 'running', currentPage: 0, totalPages: 1 },
    items: [101, 102, 103, 104, 105].map(id => ({ topicId: String(id), title: `Title ${id}` })),
  });

  let detailFetches = 0;
  scraper.fetchTopicDetails = async () => {
    detailFetches++;
    return {};
  };

  // Mock page 1 returning topics 101 to 105 (all known)
  scraper.fetchPageWithRetry = async () => mockDocWithTopics([101, 102, 103, 104, 105]);
  scraper.extractPaginationInfo = () => ({ totalPages: 1, maxStart: 0 });

  scraper.targetCategory = 'xbox';
  await scraper.start();

  assert.equal(detailFetches, 0, 'Nenhum detail fetch deve ser executado para tópicos conhecidos');
  const skipLog = logs.find(l => l.text.includes('Action=SKIP_DETAILS'));
  assert.ok(skipLog, 'Deve registrar log com Action=SKIP_DETAILS');
  assert.match(skipLog.text, /Topics=5 New=0 Existing=5 KnownPages=1\/3 Action=SKIP_DETAILS/);

  const audits = await scraper.store.getAuditLogs();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].pagesVisited, 1);
  assert.equal(audits[0].pagesSkipped, 1);
  assert.equal(audits[0].pagesWithNewItems, 0);
  assert.equal(audits[0].newItems, 0);
  assert.equal(audits[0].existingItems, 5);
  assert.equal(audits[0].topicDetailsFetched, 0);
});

test('2. Página com 1 item novo -> apenas 1 detail fetch (PROCESS_NEW)', async () => {
  const { scraper, logs } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0, knownPageLimit: 3 });

  // Pre-seed with topics 101 to 104
  await scraper.store.saveCategory({
    id: 'xbox',
    schemaVersion: 2,
    category: { id: 'xbox', name: 'Original Xbox', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' },
    scraping: { startedAt: new Date().toISOString(), status: 'running', currentPage: 0, totalPages: 1 },
    items: [101, 102, 103, 104].map(id => ({ topicId: String(id), title: `Title ${id}` })),
  });

  const fetchedUrls = [];
  scraper.fetchTopicDetails = async (url) => {
    fetchedUrls.push(url);
    return { genre: 'Action' };
  };

  // Page has 101, 102, 103, 104, 105 (only 105 is new)
  scraper.fetchPageWithRetry = async () => mockDocWithTopics([101, 102, 103, 104, 105]);
  scraper.extractPaginationInfo = () => ({ totalPages: 1, maxStart: 0 });

  scraper.targetCategory = 'xbox';
  await scraper.start();

  assert.equal(fetchedUrls.length, 1, 'Apenas 1 detail fetch deve ser executado');
  assert.ok(fetchedUrls[0].includes('105'));

  const processLog = logs.find(l => l.text.includes('Action=PROCESS_NEW'));
  assert.ok(processLog);
  assert.match(processLog.text, /Topics=5 New=1 Existing=4 KnownPages=0\/3 Action=PROCESS_NEW/);

  const audits = await scraper.store.getAuditLogs();
  assert.equal(audits[0].topicDetailsFetched, 1);
  assert.equal(audits[0].newItems, 1);
  assert.equal(audits[0].pagesWithNewItems, 1);
  assert.equal(audits[0].pagesSkipped, 0);
});

test('3. Página com 50 itens novos -> 50 detail fetches', async () => {
  const { scraper } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0, concurrency: 5 });

  let detailFetches = 0;
  scraper.fetchTopicDetails = async () => {
    detailFetches++;
    return {};
  };

  const topics50 = Array.from({ length: 50 }, (_, i) => 200 + i);
  scraper.fetchPageWithRetry = async () => mockDocWithTopics(topics50);
  scraper.extractPaginationInfo = () => ({ totalPages: 1, maxStart: 0 });

  scraper.targetCategory = 'xbox';
  await scraper.start();

  assert.equal(detailFetches, 50, 'Deve executar exatamente 50 detail fetches para 50 tópicos novos');
  const cat = await scraper.store.getCategory('xbox');
  assert.equal(cat.items.length, 50);
});

test('4. 3 páginas consecutivas conhecidas -> categoria encerra com known_pages_limit', async () => {
  const { scraper, logs } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0, knownPageLimit: 3, maxPages: 10 });

  // Pre-seed all topics for pages 1, 2, 3, 4, 5
  const allKnown = Array.from({ length: 100 }, (_, i) => 1000 + i);
  await scraper.store.saveCategory({
    id: 'xbox',
    schemaVersion: 2,
    category: { id: 'xbox', name: 'Original Xbox', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' },
    scraping: { startedAt: new Date().toISOString(), status: 'running', currentPage: 0, totalPages: 5 },
    items: allKnown.map(id => ({ topicId: String(id), title: `Title ${id}` })),
  });

  let pagesVisited = 0;
  scraper.fetchPageWithRetry = async (url) => {
    pagesVisited++;
    return mockDocWithTopics([1001, 1002, 1003]);
  };
  scraper.extractPaginationInfo = () => ({ totalPages: 5, maxStart: 200 });

  scraper.targetCategory = 'xbox';
  await scraper.start();

  assert.equal(pagesVisited, 3, 'Deve parar após 3 páginas consecutivas conhecidas e não visitar 5 páginas');
  const stopLog = logs.find(l => l.text.includes('Limite de 3 páginas conhecidas consecutivas atingido'));
  assert.ok(stopLog, 'Deve registrar log de encerramento por limite de páginas conhecidas');

  const audits = await scraper.store.getAuditLogs();
  assert.equal(audits[0].motivoTermino, 'known_pages_limit');
  assert.equal(audits[0].pagesVisited, 3);
  assert.equal(audits[0].pagesSkipped, 3);
  assert.equal(audits[0].pagesWithNewItems, 0);
});

test('5. Página nova após página conhecida -> contador knownPages reseta', async () => {
  const { scraper, logs } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0, knownPageLimit: 3, maxPages: 10 });

  // Pre-seed items: 101..105 (Page 1), 301..305 (Page 3)
  await scraper.store.saveCategory({
    id: 'xbox',
    schemaVersion: 2,
    category: { id: 'xbox', name: 'Original Xbox', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' },
    scraping: { startedAt: new Date().toISOString(), status: 'running', currentPage: 0, totalPages: 4 },
    items: [101, 102, 103, 104, 105, 301, 302, 303, 304, 305].map(id => ({ topicId: String(id), title: `Title ${id}` })),
  });

  let pageNum = 0;
  scraper.fetchPageWithRetry = async () => {
    pageNum++;
    if (pageNum === 1) return mockDocWithTopics([101, 102, 103]); // Known (consecutiveKnown=1)
    if (pageNum === 2) return mockDocWithTopics([201, 202]);      // New items! (resets consecutiveKnown=0)
    if (pageNum === 3) return mockDocWithTopics([301, 302]);      // Known (consecutiveKnown=1)
    return mockDocWithTopics([401]);                             // New items (resets consecutiveKnown=0)
  };
  scraper.extractPaginationInfo = () => ({ totalPages: 4, maxStart: 150 });

  let detailFetches = 0;
  scraper.fetchTopicDetails = async () => {
    detailFetches++;
    return {};
  };

  scraper.targetCategory = 'xbox';
  await scraper.start();

  const p1Log = logs.find(l => l.text.includes('Page 1/4') && l.text.includes('Action=SKIP_DETAILS'));
  const p2Log = logs.find(l => l.text.includes('Page 2/4') && l.text.includes('Action=PROCESS_NEW'));
  const p3Log = logs.find(l => l.text.includes('Page 3/4') && l.text.includes('Action=SKIP_DETAILS'));

  assert.ok(p1Log && p1Log.text.includes('KnownPages=1/3'));
  assert.ok(p2Log && p2Log.text.includes('KnownPages=0/3'));
  assert.ok(p3Log && p3Log.text.includes('KnownPages=1/3'));

  assert.equal(detailFetches, 3, 'Deve buscar detalhes de 201, 202 (pág 2) e 401 (pág 4)');
});

test('6. Modo full -> nunca encerra por knownPageLimit', async () => {
  const { scraper } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0, knownPageLimit: 2, maxPages: 5 });

  // Pre-seed all items
  const allKnown = Array.from({ length: 20 }, (_, i) => 500 + i);
  await scraper.store.saveCategory({
    id: 'xbox',
    schemaVersion: 2,
    category: { id: 'xbox', name: 'Original Xbox', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' },
    scraping: { startedAt: new Date().toISOString(), status: 'running', currentPage: 0, totalPages: 5 },
    items: allKnown.map(id => ({ topicId: String(id), title: `Title ${id}` })),
  });

  let pagesVisited = 0;
  scraper.fetchPageWithRetry = async () => {
    pagesVisited++;
    return mockDocWithTopics([501, 502]);
  };
  scraper.extractPaginationInfo = () => ({ totalPages: 5, maxStart: 200 });

  scraper.targetCategory = 'xbox';
  await scraper.startFull();

  assert.equal(pagesVisited, 5, 'No modo full deve visitar todas as 5 páginas mesmo todas sendo conhecidas');
  const audits = await scraper.store.getAuditLogs();
  assert.equal(audits[0].modo, 'full');
  assert.equal(audits[0].pagesVisited, 5);
  assert.equal(audits[0].pagesSkipped, 5);
  assert.equal(audits[0].motivoTermino, 'concluido');
});

test('7. Página vazia inesperada -> não conta como conhecida (PAGE_PARSE_EMPTY)', async () => {
  const { scraper, logs } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0, knownPageLimit: 2, maxPages: 4 });

  let pageNum = 0;
  scraper.fetchPageWithRetry = async () => {
    pageNum++;
    if (pageNum === 1) return mockDocWithTopics([]); // Empty doc / parse issue
    if (pageNum === 2) return mockDocWithTopics([101, 102]); // Known page
    if (pageNum === 3) return mockDocWithTopics([]); // Empty doc
    return mockDocWithTopics([101, 102]); // Known page
  };
  scraper.extractPaginationInfo = () => ({ totalPages: 4, maxStart: 150 });

  await scraper.store.saveCategory({
    id: 'xbox',
    schemaVersion: 2,
    category: { id: 'xbox', name: 'Original Xbox', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' },
    scraping: { startedAt: new Date().toISOString(), status: 'running', currentPage: 0, totalPages: 4 },
    items: [{ topicId: '101', title: '101' }, { topicId: '102', title: '102' }],
  });

  scraper.targetCategory = 'xbox';
  await scraper.start();

  const emptyLogs = logs.filter(l => l.text.includes('Action=PAGE_PARSE_EMPTY'));
  assert.equal(emptyLogs.length, 2, 'Deve registrar PAGE_PARSE_EMPTY para as 2 páginas vazias');

  // Page 2 had KnownPages=1/2, then Page 3 was empty (not incremented), then Page 4 was KnownPages=2/2 -> reached limit
  const audits = await scraper.store.getAuditLogs();
  assert.equal(audits[0].pagesVisited, 4);
});

test('8. Item duplicado na própria página -> processado uma única vez', async () => {
  const { scraper } = createScraperEnvironment();
  scraper.setOptions({ delayPageMs: 0, delayTopicMs: 0 });

  let detailFetches = 0;
  scraper.fetchTopicDetails = async () => {
    detailFetches++;
    return {};
  };

  // Page contains duplicate topicId 777
  scraper.fetchPageWithRetry = async () => mockDocWithTopics([777, 777, 888, 777]);
  scraper.extractPaginationInfo = () => ({ totalPages: 1, maxStart: 0 });

  scraper.targetCategory = 'xbox';
  await scraper.start();

  assert.equal(detailFetches, 2, 'Deve buscar detalhes apenas uma vez para o topicId 777 e uma vez para 888');
  const cat = await scraper.store.getCategory('xbox');
  assert.equal(cat.items.length, 2);
  assert.deepEqual(cat.items.map(i => i.topicId).sort(), ['777', '888']);
});
