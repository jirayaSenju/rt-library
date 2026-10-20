/**
 * Browser Companion Transport Adapter (V3-61)
 * Implements ScraperTransport interface using the Browser Companion local bridge.
 * Decouples category and topic fetching from Playwright, executing requests
 * within the user's active, authenticated browser tab.
 */

const { URL } = require('node:url');

class BrowserCompanionTransport {
  constructor(bridge) {
    if (!bridge) throw new Error('BrowserCompanionBridge is required.');
    this.bridge = bridge;
    this.id = 'BROWSER_COMPANION';
    this.name = 'Browser Companion';
  }

  isAvailable() {
    return Boolean(this.bridge.getConnection().connected);
  }

  getStatus() {
    const conn = this.bridge.getConnection();
    return {
      id: this.id,
      name: this.name,
      connected: conn.connected,
      port: conn.port,
      token: conn.token,
    };
  }

  async checkAccess(category) {
    if (!category || !category.baseUrl) {
      const { CategoryManager } = require('./categoryManager.cjs');
      const cats = CategoryManager.getInstance().getScraperCategories();
      category = cats.find(c => c.enabled !== false) || cats[0];
    }
    if (!category || !category.baseUrl) throw new Error('NO_CATEGORY_CONFIGURED');

    const result = await this.bridge.requestPage({
      kind: 'category',
      categoryId: category.id,
      url: category.baseUrl,
      pageNum: 1,
    });

    return {
      status: result.status,
      httpStatus: result.httpStatus,
      bytes: result.bytes,
      forumDetected: result.forumDetected,
      cfMitigated: result.cfMitigated,
      topicCount: result.topicCount,
      categoryId: category.id,
      categoryName: category.name,
      url: category.baseUrl,
      error: result.error,
    };
  }

  async fetchCategory(category, pageNum = 1) {
    if (!category?.baseUrl) throw new Error('INVALID_CATEGORY');
    let targetUrl = category.baseUrl;
    if (pageNum > 1) {
      const parsed = new URL(category.baseUrl);
      parsed.searchParams.set('start', String((pageNum - 1) * 50));
      targetUrl = parsed.toString();
    }

    const result = await this.bridge.requestPage({
      kind: 'category',
      categoryId: category.id,
      url: targetUrl,
      pageNum,
    });

    if (result.status === 'CHALLENGE_REQUIRED') {
      const err = new Error('INTERACTION_REQUIRED: Cloudflare challenge detected on category page.');
      err.code = 'INTERACTION_REQUIRED';
      err.status = result.status;
      err.categoryId = category.id;
      throw err;
    }

    if (result.status !== 'FORUM_READY') {
      const err = new Error(result.error || `COMPANION_FETCH_ERROR: ${result.status}`);
      err.code = result.status;
      err.categoryId = category.id;
      throw err;
    }

    return {
      topics: result.parsed?.topics || [],
      pagination: result.parsed?.pagination || { totalPages: 1 },
      status: result.status,
      httpStatus: result.httpStatus,
      bytes: result.bytes,
      url: targetUrl,
    };
  }

  async fetchTopic(topic, category) {
    const topicId = topic?.topicId || String(topic?.url || '').match(/[?&]t=(\d+)/)?.[1];
    if (!topicId) throw new Error('INVALID_TOPIC_ID');
    const topicUrl = topic.url || `https://rutracker.org/forum/viewtopic.php?t=${topicId}`;

    const result = await this.bridge.requestPage({
      kind: 'topic',
      categoryId: category?.id,
      topicId,
      url: topicUrl,
      topicTitle: topic.title,
    });

    if (result.status === 'CHALLENGE_REQUIRED') {
      const err = new Error('INTERACTION_REQUIRED: Cloudflare challenge detected on topic page.');
      err.code = 'INTERACTION_REQUIRED';
      err.status = result.status;
      err.categoryId = category?.id;
      throw err;
    }

    if (result.status !== 'FORUM_READY') {
      const err = new Error(result.error || `COMPANION_FETCH_ERROR: ${result.status}`);
      err.code = result.status;
      err.categoryId = category?.id;
      throw err;
    }

    return result.parsedTopic || {};
  }

  cancel() {
    this.bridge.cancel();
  }
}

module.exports = {
  BrowserCompanionTransport,
};

