import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const Database = require('better-sqlite3')
const { initializeSchema } = require('../../electron/database/schema.cjs')
const { setFavorite } = require('../../electron/database/repositories/favoritesRepo.cjs')
const parser = require('../../scraper/parsers/rutrackerHtmlParser.cjs')
const {
  MAX_HTML_BYTES,
  IMPORT_STATUSES,
  isRuTrackerCategoryHtml,
  isRuTrackerTopicHtml,
  detectRuTrackerPageType,
  readHtmlBounded,
  importParsedItems,
} = require('../../electron/scraper/htmlImport.cjs')
const categoryHtml = fs.readFileSync(path.resolve(__dirname, '../fixtures/rutracker-html/category-xbox.html'), 'utf8')
const topicHtml = fs.readFileSync(path.resolve(__dirname, '../fixtures/rutracker-html/topic-detail.html'), 'utf8')
let nativeSqliteAvailable = true
try { const probeDb = new Database(':memory:'); probeDb.close() } catch { nativeSqliteAvailable = false }

describe('RuTracker saved HTML import', () => {
  let tempDir: string | null = null
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  })

  it('recognizes category and topic signatures and rejects unrelated or empty HTML', () => {
    expect(isRuTrackerCategoryHtml(categoryHtml)).toBe(true)
    expect(isRuTrackerTopicHtml(topicHtml)).toBe(true)
    expect(detectRuTrackerPageType(categoryHtml)).toBe('CATEGORY_PAGE')
    expect(detectRuTrackerPageType(topicHtml)).toBe('TOPIC_PAGE')
    expect(detectRuTrackerPageType('<!doctype html><html><body>unrelated</body></html>')).toBe('UNKNOWN')
    expect(detectRuTrackerPageType('')).toBe('UNKNOWN')
  })

  it('reads a file within the limit and reports oversized input with a safe code', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-html-import-'))
    const smallFile = path.join(tempDir, 'valid.html')
    fs.writeFileSync(smallFile, '<html>ok</html>')
    await expect(readHtmlBounded(smallFile)).resolves.toContain('ok')
    const largeFile = path.join(tempDir, 'large.html')
    fs.writeFileSync(largeFile, Buffer.alloc(MAX_HTML_BYTES + 1))
    await expect(readHtmlBounded(largeFile)).rejects.toMatchObject({ code: 'IMPORT_FILE_TOO_LARGE' })
    expect(IMPORT_STATUSES.TOO_LARGE).toBe('FILE_TOO_LARGE')
    const emptyFile = path.join(tempDir, 'empty.html')
    fs.writeFileSync(emptyFile, '')
    await expect(readHtmlBounded(emptyFile)).resolves.toBe('')
    expect(detectRuTrackerPageType('<table class="forumline"><tr><a class="torTopic">')).toBe('UNKNOWN')
  })

  it.skipIf(!nativeSqliteAvailable)('deduplicates topic IDs, is idempotent, and preserves favorites and screenshots on sparse updates', () => {
    const db = new Database(':memory:')
    initializeSchema(db)
    const category = { id: 'xbox', name: 'Xbox 360', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' }
    const initial = {
      id: 'topic_6001001', topicId: '6001001', title: 'Halo 3: ODST', topicTitle: 'Halo 3: ODST',
      url: 'https://rutracker.org/forum/viewtopic.php?t=6001001', source: { site: 'rutracker' },
      screenshots: ['https://i128.fastpic.org/big/2026/1001/9b/a1cdfbd11a82467fd92e089b5516499b.jpeg'],
    }
    const first = importParsedItems(db, category, [initial, initial, { title: 'Missing ID' }])
    expect(first).toMatchObject({ inserted: 1, updated: 0, skipped: 2, invalid: 1 })
    setFavorite(db, initial.id, true)

    const second = importParsedItems(db, category, [{ ...initial, title: 'Halo 3 ODST updated', screenshots: undefined }])
    expect(second).toMatchObject({ inserted: 0, updated: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM items WHERE source = ? AND topic_id = ?').get('rutracker', '6001001').count).toBe(1)
    expect(db.prepare('SELECT is_favorite FROM items WHERE id = ?').get(initial.id).is_favorite).toBe(1)
    const details = db.prepare('SELECT screenshots_json FROM item_details WHERE item_id = ?').get(initial.id)
    expect(JSON.parse(details.screenshots_json)).toEqual(initial.screenshots)
    db.close()
  })

  it('does not execute scripts embedded in supplied HTML', () => {
    const html = '<html><body><script>globalThis.__htmlImportExecuted = true</script></body></html>'
    expect(detectRuTrackerPageType(html)).toBe('UNKNOWN')
    expect((globalThis as any).__htmlImportExecuted).toBeUndefined()
  })

  it.skipIf(!nativeSqliteAvailable)('ingests parsed category topics and parsed topic metadata through the shared batch service', () => {
    const db = new Database(':memory:')
    initializeSchema(db)
    const category = { id: 'xbox', name: 'Xbox 360', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' }
    const listing = parser.parseCategoryHtml(categoryHtml, { categoryId: category.id, categoryName: category.name, categoryBaseUrl: category.baseUrl })
    const categoryResult = importParsedItems(db, category, listing.topics)
    expect(categoryResult.inserted).toBe(3)

    const topicId = '6001001'
    const withCanonical = topicHtml.replace('<head>', '<head><link rel="canonical" href="https://rutracker.org/forum/viewtopic.php?t=6001001">')
    const details = parser.parseTopicHtml(withCanonical)
    const detailResult = importParsedItems(db, category, [{ ...details, topicId, title: 'Halo 3: ODST', topicTitle: 'Halo 3: ODST', url: `https://rutracker.org/forum/viewtopic.php?t=${topicId}`, source: { site: 'rutracker' } }])
    expect(detailResult.updated).toBe(1)
    const saved = db.prepare('SELECT has_magnet, has_screenshots FROM items WHERE topic_id = ?').get(topicId)
    expect(saved).toEqual({ has_magnet: 1, has_screenshots: 1 })
    const savedDetails = db.prepare('SELECT magnet, file_list_json, screenshots_json FROM item_details WHERE item_id = ?').get(`topic_${topicId}`)
    expect(savedDetails.magnet).toContain('magnet:?xt=urn:btih:')
    expect(savedDetails.file_list_json).toContain('halo3_odst.iso')
    expect(JSON.parse(savedDetails.screenshots_json)).toHaveLength(2)
    db.close()
  })
})
