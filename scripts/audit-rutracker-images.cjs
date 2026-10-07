/**
 * RuTracker Image Extraction Audit Script (V3-11)
 * 
 * Performs an empirical audit of RuTracker cover and screenshot DOM patterns
 * across all enabled categories (Page 1 only).
 * 
 * Usage:
 *   node scripts/audit-rutracker-images.cjs [--category <id>] [--limit <perCategory>] [--headed]
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

// Load categories
function getEnabledCategories() {
  try {
    const { CategoryManager } = require('../electron/scraper/categoryManager.cjs');
    const categories = CategoryManager.getInstance().getResolvedCategories();
    return categories.filter(c => c.enabled !== false);
  } catch (_) {
    const { DEFAULT_CATEGORIES } = require('../electron/scraper/defaultCategories.cjs');
    return DEFAULT_CATEGORIES.filter(c => c.enabled !== false);
  }
}

function getScraperProfileDir() {
  if (process.env.SCRAPER_PROFILE_DIR) {
    return path.resolve(process.env.SCRAPER_PROFILE_DIR);
  }
  const baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const profileDir = path.join(baseDir, 'rt-library', 'scraper-profile');
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

function classifyUrl(url) {
  if (!url || typeof url !== 'string') return 'UNRESOLVED';
  const clean = url.trim();
  if (clean.startsWith('data:')) return 'DATA_URL';

  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (/\.(?:html?|php)$/i.test(pathname) || pathname.includes('/fullview/') || pathname.includes('/view/') || pathname.includes('/show/')) {
      return 'INTERMEDIATE_PAGE';
    }

    if (pathname.includes('/thumb/') || pathname.includes('/thumbs/') || /_thumb|\.th\.|\.t\./i.test(pathname)) {
      return 'THUMBNAIL';
    }

    if (/\.(?:jpe?g|png|webp|gif|bmp|avif)$/i.test(pathname)) {
      return 'DIRECT_IMAGE';
    }

    if (host.includes('fastpic') || host.includes('imageban') || host.includes('imagebam') || host.includes('postimg') || host.includes('ibb.co')) {
      return 'HOST_URL_UNKNOWN';
    }

    return 'DIRECT_IMAGE';
  } catch (_) {
    return 'UNRESOLVED';
  }
}

function identifyProvider(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('fastpic')) return 'fastpic.org';
    if (host.includes('imageban')) return 'imageban.ru';
    if (host.includes('imagebam')) return 'imagebam.com';
    if (host.includes('postimg') || host.includes('postimage')) return 'postimg.cc';
    if (host.includes('ibb.co') || host.includes('imgbb')) return 'ibb.co';
    if (host.includes('radikal')) return 'radikal.ru';
    if (host.includes('lostpic')) return 'lostpic.net';
    if (host.includes('imgur')) return 'imgur.com';
    if (host.includes('yandex')) return 'yandex.ru';
    if (host.includes('vk.com') || host.includes('userapi')) return 'vk.com';
    if (host.includes('rutracker.org') || host.includes('rutracker.cc')) return 'rutracker.org';
    return host;
  } catch (_) {
    return 'unknown';
  }
}

async function validateUrlMime(url) {
  if (!url || !url.startsWith('http')) return { status: 0, contentType: 'invalid', isImage: false };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    clearTimeout(timer);
    const ct = (resp.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    return {
      status: resp.status,
      contentType: ct,
      isImage: ct.startsWith('image/')
    };
  } catch (err) {
    return { status: 0, contentType: 'error', error: err.message, isImage: false };
  }
}

async function runAudit() {
  const args = process.argv.slice(2);
  let targetCategory = null;
  let topicLimitPerCat = null;
  let headed = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && i + 1 < args.length) targetCategory = args[++i];
    else if (args[i] === '--limit' && i + 1 < args.length) topicLimitPerCat = parseInt(args[++i], 10);
    else if (args[i] === '--headed') headed = true;
  }

  const enabledCategories = getEnabledCategories();
  const categoriesToAudit = targetCategory 
    ? enabledCategories.filter(c => c.id === targetCategory) 
    : enabledCategories;

  if (categoriesToAudit.length === 0) {
    console.error(`[IMAGE-AUDIT] No matching enabled categories found (target: ${targetCategory || 'ALL'}).`);
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseOutDir = path.resolve(__dirname, `../diagnostics/image-audit/${timestamp}`);
  if (!fs.existsSync(baseOutDir)) fs.mkdirSync(baseOutDir, { recursive: true });

  const profileDir = getScraperProfileDir();
  console.log(`================================================================================`);
  console.log(`[IMAGE-AUDIT] Starting RuTracker Image Extraction Audit (V3-11)`);
  console.log(`[IMAGE-AUDIT] Categories: ${categoriesToAudit.length} enabled`);
  console.log(`[IMAGE-AUDIT] Output Directory: ${baseOutDir}`);
  console.log(`[IMAGE-AUDIT] Profile Directory: ${profileDir}`);
  console.log(`================================================================================\n`);

  const manifest = {
    startedAt: new Date().toISOString(),
    categoriesTotal: enabledCategories.length,
    categoriesAudited: categoriesToAudit.length,
    topicLimitPerCat,
    topicsDiscovered: 0,
    topicsScanned: 0,
    topicsWithCover: 0,
    topicsWithScreenshots: 0,
    screenshotBlocksTotal: 0,
    multipleScreenshotGroupsCount: 0,
    providers: {},
    urlClassifications: {
      DIRECT_IMAGE: 0,
      INTERMEDIATE_PAGE: 0,
      THUMBNAIL: 0,
      LAZY_IMAGE: 0,
      REDIRECT: 0,
      UNRESOLVED: 0,
      HOST_URL_UNKNOWN: 0,
    },
    fastpicPatterns: {
      fullviewHtml: 0,
      viewHtml: 0,
      thumbToBig: 0,
      directBig: 0,
      jpegVsJpgExt: 0,
    },
    failures: [],
    categorySummaries: [],
  };

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: !headed,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36',
    args: [
      ...(!headed ? ['--headless=new'] : []),
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();

  try {
    for (let catIdx = 0; catIdx < categoriesToAudit.length; catIdx++) {
      const category = categoriesToAudit[catIdx];
      console.log(`\n--------------------------------------------------------------------------------`);
      console.log(`[IMAGE-AUDIT][CATEGORY] [${catIdx + 1}/${categoriesToAudit.length}] ${category.name} (${category.id})`);
      console.log(`[IMAGE-AUDIT][CATEGORY] URL: ${category.baseUrl}`);
      console.log(`--------------------------------------------------------------------------------`);

      const catSummary = {
        id: category.id,
        name: category.name,
        baseUrl: category.baseUrl,
        topicsFound: 0,
        topicsAudited: 0,
        coversFound: 0,
        screenshotsFound: 0,
      };

      // 1. Visit category Page 1
      try {
        await page.goto(category.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
      } catch (err) {
        console.error(`[IMAGE-AUDIT][ERROR] Failed to load category page ${category.baseUrl}: ${err.message}`);
        manifest.failures.push({ category: category.id, stage: 'category_load', error: err.message });
        continue;
      }

      // Check if Cloudflare challenge is present
      const isChallenge = await page.evaluate(() => {
        return document.title.includes('Just a moment') || !!document.querySelector('#challenge-running, #challenge-form');
      });

      if (isChallenge) {
        console.warn(`[IMAGE-AUDIT][WARN] Cloudflare challenge encountered on category ${category.name}! INTERACTION_REQUIRED.`);
        manifest.failures.push({ category: category.id, stage: 'cloudflare_challenge', error: 'INTERACTION_REQUIRED' });
        continue;
      }

      // 2. Discover topics on Page 1
      const discoveredTopics = await page.evaluate((titleTerms) => {
        const links = Array.from(document.querySelectorAll('a.torTopic'));
        return links.map((a, idx) => {
          const title = (a.textContent || '').trim();
          const href = a.getAttribute('href') || '';
          const topicIdMatch = href.match(/t=(\d+)/);
          const topicId = topicIdMatch ? topicIdMatch[1] : null;

          let matches = true;
          if (titleTerms && titleTerms.length > 0) {
            matches = titleTerms.some(term => title.toLowerCase().includes(term.toLowerCase()));
          }

          const fullUrl = href.startsWith('http')
            ? href
            : `https://rutracker.org/forum/${href.replace(/^\/?/, '')}`;

          return {
            indexOnPage: idx + 1,
            topicId,
            topicTitle: title,
            topicUrl: fullUrl,
            matchesTitleFilter: matches,
          };
        }).filter(t => t.topicId && t.matchesTitleFilter);
      }, Array.isArray(category.titleSearch) ? category.titleSearch : (category.titleSearch ? [category.titleSearch] : []));

      catSummary.topicsFound = discoveredTopics.length;
      manifest.topicsDiscovered += discoveredTopics.length;
      console.log(`[IMAGE-AUDIT][DISCOVERY] Found ${discoveredTopics.length} valid topics on Page 1.`);

      const topicsToProcess = topicLimitPerCat 
        ? discoveredTopics.slice(0, topicLimitPerCat) 
        : discoveredTopics;

      const catOutDir = path.join(baseOutDir, category.id);
      if (!fs.existsSync(catOutDir)) fs.mkdirSync(catOutDir, { recursive: true });

      // 3. Process each topic
      for (let tIdx = 0; tIdx < topicsToProcess.length; tIdx++) {
        const topic = topicsToProcess[tIdx];
        console.log(`\n  [TOPIC ${tIdx + 1}/${topicsToProcess.length}] ID: ${topic.topicId} | "${topic.topicTitle.slice(0, 60)}..."`);
        const topicDir = path.join(catOutDir, String(topic.topicId));
        if (!fs.existsSync(topicDir)) fs.mkdirSync(topicDir, { recursive: true });

        try {
          // Polite delay between topics
          await page.waitForTimeout(600);

          // Track network image requests during this topic
          const networkImageRequests = [];
          const responseListener = (res) => {
            const url = res.url();
            const ct = (res.headers()['content-type'] || '').toLowerCase();
            if (ct.startsWith('image/') || url.includes('fastpic') || url.includes('imageban')) {
              networkImageRequests.push({
                url,
                status: res.status(),
                contentType: ct,
                contentLength: res.headers()['content-length'] || null,
              });
            }
          };
          page.on('response', responseListener);

          // Open topic
          await page.goto(topic.topicUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(800);

          const initialHtml = await page.content();
          fs.writeFileSync(path.join(topicDir, 'page-initial.html'), initialHtml, 'utf8');

          const postBodyHtml = await page.evaluate(() => {
            const pb = document.querySelector('.post_body');
            return pb ? pb.innerHTML : '';
          });
          fs.writeFileSync(path.join(topicDir, 'post-body.html'), postBodyHtml, 'utf8');

          // --- COVER EXTRACTION & ANALYSIS ---
          const coverData = await page.evaluate(() => {
            const postBody = document.querySelector('.post_body');
            if (!postBody) return { found: false };

            // Find cover candidates:
            // 1. Explicitly aligned cover image
            const alignedImg = postBody.querySelector('img.postImg.postImgAligned, img.img-right, img.postImgAligned');
            if (alignedImg) {
              const src = alignedImg.getAttribute('src') || alignedImg.getAttribute('data-src') || '';
              const parentAnchor = alignedImg.closest('a');
              return {
                found: true,
                selector: 'img.postImg.postImgAligned',
                tag: 'img',
                src,
                currentSrc: alignedImg.currentSrc || src,
                dataSrc: alignedImg.getAttribute('data-src') || null,
                anchorHref: parentAnchor ? parentAnchor.getAttribute('href') : null,
                naturalWidth: alignedImg.naturalWidth,
                naturalHeight: alignedImg.naturalHeight,
                alt: alignedImg.getAttribute('alt') || '',
              };
            }

            // 2. RuTracker lazy <var> element outside spoilers
            const cleanBody = postBody.cloneNode(true);
            cleanBody.querySelectorAll('.sp-wrap').forEach(el => el.remove());
            const firstVar = cleanBody.querySelector('var.postImg, var');
            if (firstVar && firstVar.getAttribute('title')) {
              const titleUrl = firstVar.getAttribute('title');
              const parentAnchor = firstVar.closest('a');
              return {
                found: true,
                selector: 'var.postImg[title]',
                tag: 'var',
                src: titleUrl,
                currentSrc: titleUrl,
                dataSrc: null,
                anchorHref: parentAnchor ? parentAnchor.getAttribute('href') : null,
                naturalWidth: 0,
                naturalHeight: 0,
                alt: '',
              };
            }

            // 3. First non-spoiler img
            const firstImg = cleanBody.querySelector('img.postImg, img');
            if (firstImg) {
              const src = firstImg.getAttribute('src') || firstImg.getAttribute('data-src') || '';
              // Skip icons/trackers/smilies
              if (!src.includes('smiles') && !src.includes('icon') && !src.includes('spacer')) {
                const parentAnchor = firstImg.closest('a');
                return {
                  found: true,
                  selector: 'cleanBody img.postImg',
                  tag: 'img',
                  src,
                  currentSrc: firstImg.currentSrc || src,
                  dataSrc: firstImg.getAttribute('data-src') || null,
                  anchorHref: parentAnchor ? parentAnchor.getAttribute('href') : null,
                  naturalWidth: firstImg.naturalWidth,
                  naturalHeight: firstImg.naturalHeight,
                  alt: firstImg.getAttribute('alt') || '',
                };
              }
            }

            return { found: false };
          });

          if (coverData.found) {
            manifest.topicsWithCover++;
            catSummary.coversFound++;
            const coverProvider = identifyProvider(coverData.src || coverData.anchorHref);
            manifest.providers[coverProvider] = (manifest.providers[coverProvider] || 0) + 1;
            const classification = classifyUrl(coverData.src);
            manifest.urlClassifications[classification] = (manifest.urlClassifications[classification] || 0) + 1;
            console.log(`    [COVER] Found via "${coverData.selector}" -> ${coverData.src} (Provider: ${coverProvider}, Class: ${classification})`);
          } else {
            console.log(`    [COVER] None detected.`);
          }

          // --- SCREENSHOT BLOCKS COLLAPSED & EXPANDED ANALYSIS ---
          const screenshotAnalysis = await page.evaluate(() => {
            const postBody = document.querySelector('.post_body');
            if (!postBody) return { blocks: [], totalGroups: 0 };

            const spoilers = Array.from(postBody.querySelectorAll('.sp-wrap'));
            const blocks = [];

            spoilers.forEach((wrap, sIdx) => {
              const head = wrap.querySelector('.sp-head, .sp-tit');
              const headText = (head?.textContent || '').trim();
              const lower = headText.toLowerCase();

              const isScreenshotSpoiler = lower.includes('скриншот') || lower.includes('screenshot') || lower.includes('снимок');
              if (isScreenshotSpoiler) {
                const spBody = wrap.querySelector('.sp-body');
                const isMainExact = lower === 'скриншоты' || lower === 'скриншот' || lower === 'screenshots';

                // Inspect collapsed state
                const collapsedHtml = wrap.outerHTML;
                const collapsedImgs = spBody ? Array.from(spBody.querySelectorAll('img, var')).map(el => ({
                  tag: el.tagName.toLowerCase(),
                  src: el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('title') || '',
                  anchorHref: el.closest('a')?.getAttribute('href') || null,
                })) : [];

                blocks.push({
                  index: sIdx,
                  label: headText,
                  isMainExact,
                  hasTrigger: !!head,
                  triggerSelector: head ? `.sp-wrap:nth-of-type(${sIdx + 1}) .sp-head` : null,
                  collapsedHtml,
                  collapsedElementCount: collapsedImgs.length,
                  collapsedImgs,
                });
              }
            });

            return { blocks, totalGroups: blocks.length };
          });

          if (screenshotAnalysis.blocks.length > 0) {
            manifest.screenshotBlocksTotal += screenshotAnalysis.blocks.length;
            if (screenshotAnalysis.blocks.length > 1) {
              manifest.multipleScreenshotGroupsCount++;
            }
          }

          // Save collapsed HTML
          if (screenshotAnalysis.blocks.length > 0) {
            fs.writeFileSync(
              path.join(topicDir, 'screenshots-collapsed.html'),
              screenshotAnalysis.blocks.map(b => `<!-- GROUP: ${b.label} -->\n${b.collapsedHtml}`).join('\n\n'),
              'utf8'
            );
          }

          // Expand each screenshot spoiler block by clicking trigger
          const expandedScreenshots = [];

          for (let bIdx = 0; bIdx < screenshotAnalysis.blocks.length; bIdx++) {
            const block = screenshotAnalysis.blocks[bIdx];

            // Click the spoiler head locator
            try {
              const spoilerLoc = page.locator('.sp-wrap').filter({ hasText: block.label }).locator('.sp-head, .sp-tit').first();
              const isVisible = await spoilerLoc.isVisible().catch(() => false);
              if (isVisible) {
                await spoilerLoc.click({ timeout: 5000 });
                // Wait for expansion to animate / DOM to settle
                await page.waitForTimeout(400);
              }
            } catch (clickErr) {
              console.warn(`    [SCREENSHOTS] Click expand failed on "${block.label}": ${clickErr.message}`);
            }

            // Extract expanded screenshots for this block
            const blockExpandedData = await page.evaluate((label) => {
              const wraps = Array.from(document.querySelectorAll('.sp-wrap'));
              const targetWrap = wraps.find(w => (w.querySelector('.sp-head, .sp-tit')?.textContent || '').trim() === label);
              if (!targetWrap) return { expandedHtml: '', images: [] };

              const expandedHtml = targetWrap.outerHTML;
              const spBody = targetWrap.querySelector('.sp-body');
              if (!spBody) return { expandedHtml, images: [] };

              const results = [];
              const anchors = Array.from(spBody.querySelectorAll('a'));

              anchors.forEach((a, aIdx) => {
                const href = a.getAttribute('href') || '';
                const img = a.querySelector('img, var');
                const src = img ? (img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('title') || '') : '';
                const currentSrc = (img && img.tagName === 'IMG') ? img.currentSrc : src;

                results.push({
                  index: aIdx,
                  sourceType: 'anchor_wrapped',
                  anchorHref: href,
                  imgSrc: src,
                  currentSrc,
                  dataSrc: img ? img.getAttribute('data-src') : null,
                  tag: img ? img.tagName.toLowerCase() : 'a',
                  naturalWidth: (img && img.tagName === 'IMG') ? img.naturalWidth : 0,
                  naturalHeight: (img && img.tagName === 'IMG') ? img.naturalHeight : 0,
                });
              });

              // Also check direct images not in anchor
              const directImgs = Array.from(spBody.querySelectorAll(':scope > img, :scope > var, :scope > p > img, :scope > span > img'));
              directImgs.forEach((img, dIdx) => {
                if (!img.closest('a')) {
                  const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('title') || '';
                  results.push({
                    index: results.length,
                    sourceType: 'direct_img',
                    anchorHref: null,
                    imgSrc: src,
                    currentSrc: (img.tagName === 'IMG') ? img.currentSrc : src,
                    dataSrc: img.getAttribute('data-src'),
                    tag: img.tagName.toLowerCase(),
                    naturalWidth: (img.tagName === 'IMG') ? img.naturalWidth : 0,
                    naturalHeight: (img.tagName === 'IMG') ? img.naturalHeight : 0,
                  });
                }
              });

              return { expandedHtml, images: results };
            }, block.label);

            expandedScreenshots.push({
              groupLabel: block.label,
              isMainExact: block.isMainExact,
              expandedHtml: blockExpandedData.expandedHtml,
              images: blockExpandedData.images,
            });
          }

          // Save expanded HTML
          if (expandedScreenshots.length > 0) {
            fs.writeFileSync(
              path.join(topicDir, 'screenshots-expanded.html'),
              expandedScreenshots.map(g => `<!-- EXPANDED GROUP: ${g.groupLabel} -->\n${g.expandedHtml}`).join('\n\n'),
              'utf8'
            );
          }

          // Unregister response listener
          page.off('response', responseListener);

          // Classify all extracted screenshot images & map FastPic patterns
          let topicScreenshotCount = 0;
          const processedImages = [];

          for (const group of expandedScreenshots) {
            for (const item of group.images) {
              topicScreenshotCount++;
              const candidateUrl = item.anchorHref || item.imgSrc || item.currentSrc;
              const provider = identifyProvider(candidateUrl);
              const anchorClass = classifyUrl(item.anchorHref);
              const imgClass = classifyUrl(item.imgSrc);

              manifest.providers[provider] = (manifest.providers[provider] || 0) + 1;
              manifest.urlClassifications[anchorClass] = (manifest.urlClassifications[anchorClass] || 0) + 1;

              // FastPic Pattern breakdown
              if (provider === 'fastpic.org') {
                if (item.anchorHref && item.anchorHref.includes('/fullview/')) manifest.fastpicPatterns.fullviewHtml++;
                if (item.anchorHref && item.anchorHref.includes('/view/')) manifest.fastpicPatterns.viewHtml++;
                if (item.imgSrc && item.imgSrc.includes('/thumb/')) manifest.fastpicPatterns.thumbToBig++;
                if (candidateUrl && candidateUrl.includes('/big/')) manifest.fastpicPatterns.directBig++;
                if (candidateUrl && /\.jpe?g/i.test(candidateUrl)) manifest.fastpicPatterns.jpegVsJpgExt++;
              }

              processedImages.push({
                group: group.groupLabel,
                isMainExact: group.isMainExact,
                sourceType: item.sourceType,
                anchorHref: item.anchorHref,
                anchorClassification: anchorClass,
                imgSrc: item.imgSrc,
                imgClassification: imgClass,
                currentSrc: item.currentSrc,
                provider,
                naturalWidth: item.naturalWidth,
                naturalHeight: item.naturalHeight,
              });
            }
          }

          if (topicScreenshotCount > 0) {
            manifest.topicsWithScreenshots++;
            catSummary.screenshotsFound += topicScreenshotCount;
            console.log(`    [SCREENSHOTS] Found ${topicScreenshotCount} screenshots in ${expandedScreenshots.length} group(s).`);
          } else {
            console.log(`    [SCREENSHOTS] 0 screenshots.`);
          }

          // Save images.json manifest for this topic
          const topicManifest = {
            topicId: topic.topicId,
            topicTitle: topic.topicTitle,
            topicUrl: topic.topicUrl,
            category: category.id,
            categoryName: category.name,
            cover: coverData,
            screenshotGroups: expandedScreenshots.length,
            screenshots: processedImages,
            networkRequests: networkImageRequests,
          };

          fs.writeFileSync(path.join(topicDir, 'images.json'), JSON.stringify(topicManifest, null, 2), 'utf8');

          catSummary.topicsAudited++;
          manifest.topicsScanned++;

        } catch (topicErr) {
          console.error(`    [TOPIC ERROR] Failed to audit topic ${topic.topicId}: ${topicErr.message}`);
          manifest.failures.push({
            category: category.id,
            topicId: topic.topicId,
            stage: 'topic_processing',
            error: topicErr.message,
          });
        }
      }

      manifest.categorySummaries.push(catSummary);
    }
  } finally {
    await browser.close();
  }

  manifest.completedAt = new Date().toISOString();
  const manifestPath = path.join(baseOutDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n================================================================================`);
  console.log(`[IMAGE-AUDIT] Audit Complete!`);
  console.log(`[IMAGE-AUDIT] Categories Audited: ${manifest.categoriesAudited}`);
  console.log(`[IMAGE-AUDIT] Topics Scanned: ${manifest.topicsScanned}/${manifest.topicsDiscovered}`);
  console.log(`[IMAGE-AUDIT] Topics with Cover: ${manifest.topicsWithCover}`);
  console.log(`[IMAGE-AUDIT] Topics with Screenshots: ${manifest.topicsWithScreenshots}`);
  console.log(`[IMAGE-AUDIT] Manifest saved to: ${manifestPath}`);
  console.log(`================================================================================\n`);

  return { manifest, outDir: baseOutDir };
}

if (require.main === module) {
  runAudit().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('[IMAGE-AUDIT][FATAL]', err);
    process.exit(1);
  });
}

module.exports = { runAudit };

