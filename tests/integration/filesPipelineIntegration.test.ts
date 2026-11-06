import { describe, it, expect, beforeEach } from 'vitest'
import { parseTopicHtml } from '../../scraper/parsers/rutrackerHtmlParser.cjs'
import { normalizeItem } from '../../electron/indexer/normalize.cjs'
import { ingestRawBatch } from '../../electron/indexer/ingestionService.cjs'
import detailsRepo from '../../electron/database/repositories/detailsRepo.cjs'
import itemsRepo from '../../electron/database/repositories/itemsRepo.cjs'
import { resolveTorrentDisplayData } from '../../src/utils/torrentSourceResolver'

function createTestDb() {
  const items = new Map<string, any>()
  const itemDetails = new Map<string, any>()
  const categories = new Map<string, any>()

  const db = {
    _items: items,
    _itemDetails: itemDetails,
    _categories: categories,

    transaction: (fn: (...args: any[]) => any) => (...args: any[]) => fn(...args),

    prepare: (sql: string) => {
      // 1. SELECT id FROM items WHERE id = ?
      if (sql.includes('SELECT id FROM items WHERE id = ?')) {
        return {
          get: (id: string) => items.has(id) ? { id } : null,
        }
      }

      // 2. Count physical items by category
      if (sql.includes('COUNT(*) as total FROM items WHERE category_id = ?')) {
        return {
          get: (catId: string) => {
            let total = 0
            for (const item of items.values()) {
              if (item.category_id === catId) total++
            }
            return { total }
          },
        }
      }

      // 3. Upsert category
      if (sql.includes('INSERT INTO categories')) {
        return {
          run: (cat: any) => {
            categories.set(cat.id, { ...(categories.get(cat.id) || {}), ...cat })
            return { changes: 1 }
          },
        }
      }

      // 4. Upsert item
      if (sql.includes('INSERT INTO items')) {
        return {
          run: (item: any) => {
            const row = {
              id: item.id,
              category_id: item.categoryId || item.category_id,
              source: item.source,
              topic_id: item.topicId || item.topic_id,
              title: item.title,
              topic_title: item.topicTitle || item.topic_title,
              canonical_title: item.canonicalTitle || item.canonical_title,
              normalized_title: item.normalizedTitle || item.normalized_title,
              clean_title: item.cleanTitle || item.clean_title,
              title_sort: item.titleSort || item.title_sort,
              size_bytes: item.sizeBytes ?? item.size_bytes,
              size_str: item.sizeStr || item.size_str,
              has_screenshots: item.hasScreenshots ? 1 : 0,
              has_cover: item.hasCover ? 1 : 0,
              has_magnet: item.hasMagnet ? 1 : 0,
              is_favorite: item.isFavorite ? 1 : 0,
            }
            items.set(item.id, { ...(items.get(item.id) || {}), ...row })
            return { changes: 1 }
          },
        }
      }

      // 5. Get item by id
      if (sql.includes('FROM items') && sql.includes('WHERE items.id = ?')) {
        return {
          get: (id: string) => {
            const raw = items.get(id)
            if (!raw) return null
            const details = itemDetails.get(id)
            return {
              ...raw,
              magnet: details?.magnet || null,
              seeds: null,
              leechers: null,
              peers: null,
              swarm_status: null,
              swarm_source: null,
              swarm_fetched_at: null,
            }
          },
        }
      }

      // 6. Upsert item_details
      if (sql.includes('INSERT INTO item_details')) {
        return {
          run: (params: any) => {
            const existing = itemDetails.get(params.itemId) || {}
            itemDetails.set(params.itemId, {
              item_id: params.itemId,
              magnet: params.magnet !== null && params.magnet !== undefined ? params.magnet : existing.magnet,
              file_list_json: params.fileListJson !== null && params.fileListJson !== undefined ? params.fileListJson : existing.file_list_json,
              screenshots_json: params.screenshotsJson !== null && params.screenshotsJson !== undefined ? params.screenshotsJson : existing.screenshots_json,
              source_json: params.sourceJson !== null && params.sourceJson !== undefined ? params.sourceJson : existing.source_json,
              scraping_json: params.scrapingJson !== null && params.scrapingJson !== undefined ? params.scrapingJson : existing.scraping_json,
            })
            return { changes: 1 }
          },
        }
      }

      // 7. Get item_details by item_id
      if (sql.includes('FROM item_details') && sql.includes('WHERE item_id = ?')) {
        return {
          get: (itemId: string) => itemDetails.get(itemId) || null,
        }
      }

      // Default fallback
      return {
        get: () => null,
        all: () => [],
        run: () => ({ changes: 1 }),
      }
    },
  }

  return db
}

describe('Full Files Data Pipeline Integration (Topic HTML -> Parser -> Ingestion -> SQLite -> Details -> Resolver)', () => {
  let db: any

  beforeEach(() => {
    db = createTestDb()
  })

  const modernNsw2Html = `
    <h1 class="maintitle">
      <a id="topic-title" href="https://rutracker.org/forum/viewtopic.php?t=6933053">[NSW2] The Legend of Zelda: Ocarina of Time (2026) [NUP][RUS/Multi16]</a>
    </h1>
    <div style="padding-top: 6px;">
      <input id="tor-filelist-btn" type="button" class="lite" value="Список файлов">
    </div>
    <span id="tor-size-humn" title="25020741061">23.3&nbsp;GB</span>
    <a href="magnet:?xt=urn:btih:6506209D75146BA74F4289A33A4ADEED12345678" class="magnet-link"></a>
    <div id="tor-fl-wrap">
      <div id="tor-filelist" class="med ftree-windowed">
        <ul class="ftree">
          <li class="dir">
            <div><b>./The Legend of Zelda Ocarina of Time [NUP]</b><s> 23.30 GB</s></div>
            <ul>
              <li class="file">
                <div><b>The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup</b><s> 23.30 GB </s><i>25020741061</i></div>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
    <div class="post_body" id="p-6933053">
      <span style="font-size: 24px; line-height: normal;">The Legend of Zelda: Ocarina of Time</span><br>
      <var class="postImg" title="https://i128.fastpic.org/big/2026/zelda_cover.jpg"></var><br>
      <span class="post-b">Год выпуска</span>: 2026<br>
      <span class="post-b">Жанр</span>: Action / Adventure<br>
      <span class="post-b">Разработчик</span>: Nintendo<br>
      <span class="post-b">Формат образа</span>: NUP<br>
    </div>
  `

  const legacySpoilerHtml = `
    <h1 class="maintitle">
      <a id="topic-title" href="https://rutracker.org/forum/viewtopic.php?t=5555555">[Xbox 360] Retro Game [Region Free]</a>
    </h1>
    <a href="magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" class="magnet-link"></a>
    <div class="post_body" id="p-5555555">
      <span class="post-b">Разработчик</span>: Retro Dev<br>
      <div class="sp-wrap">
        <div class="sp-head-wrap"><div class="sp-head folded"><span>Список файлов</span></div></div>
        <div class="sp-body">game.iso\nupdate.xex\nreadme.txt</div>
      </div>
    </div>
  `

  it('parses, normalizes, ingests, and retrieves modern NSW2 file list end-to-end', () => {
    // 1. Topic HTML parser
    const parsed = parseTopicHtml(modernNsw2Html, {
      topicTitle: '[NSW2] The Legend of Zelda: Ocarina of Time (2026) [NUP][RUS/Multi16]',
    })
    expect(parsed.canonicalTitle).toBe('The Legend of Zelda: Ocarina of Time')
    expect(parsed.fileList).toContain('The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup')
    expect(parsed.files).toBeDefined()
    expect(parsed.files).toHaveLength(1)
    expect(parsed.files[0].name).toBe('The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup')
    expect(parsed.files[0].path).toBe('The Legend of Zelda Ocarina of Time [NUP]/The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup')
    expect(parsed.files[0].sizeBytes).toBe(25020741061)

    // 2. Normalizer
    const rawItem = {
      ...parsed,
      topicId: '6933053',
      url: 'https://rutracker.org/forum/viewtopic.php?t=6933053',
    }
    const normalized = normalizeItem(rawItem, 'switch2', 'Nintendo Switch 2')
    expect(normalized).not.toBeNull()
    expect(normalized.details.fileList).toBeDefined()
    expect(normalized.details.fileList).toHaveLength(1)
    expect(normalized.details.fileList[0].path).toBe('The Legend of Zelda Ocarina of Time [NUP]/The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup')

    // 3. Ingestion into SQLite
    const category = { id: 'switch2', name: 'Nintendo Switch 2', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=2650' }
    const result = ingestRawBatch(db, category, [rawItem])
    expect(result.inserted).toBe(1)

    // 4. Persistence verification
    const item = itemsRepo.getById(db, 'topic_6933053')
    expect(item).not.toBeNull()
    expect(item.canonicalTitle).toBe('The Legend of Zelda: Ocarina of Time')

    const details = detailsRepo.getByItemId(db, 'topic_6933053')
    expect(details).not.toBeNull()
    expect(Array.isArray(details.fileList)).toBe(true)
    expect(details.fileList).toHaveLength(1)
    expect(details.fileList[0].name).toBe('The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup')

    // 5. Source Resolver (combining DB details with UI display data)
    const resolved = resolveTorrentDisplayData({
      catalog: {
        fileList: details.fileList,
        sizeBytes: item.sizeBytes,
      },
      torrentMetadata: null,
    })
    expect(resolved.files).toHaveLength(1)
    expect(resolved.filesSource).toBe('catalog')
    expect(resolved.files![0].name).toBe('The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup')
    expect(resolved.files![0].extension).toBe('NUP')
    expect(resolved.files![0].dirPath).toBe('The Legend of Zelda Ocarina of Time [NUP]')
  })

  it('parses, normalizes, ingests, and retrieves legacy spoiler file list end-to-end', () => {
    const parsed = parseTopicHtml(legacySpoilerHtml, {
      topicTitle: '[Xbox 360] Retro Game [Region Free]',
    })
    expect(parsed.fileList).toBe('game.iso\nupdate.xex\nreadme.txt')

    const rawItem = {
      ...parsed,
      topicId: '5555555',
      url: 'https://rutracker.org/forum/viewtopic.php?t=5555555',
    }
    const category = { id: 'xbox', name: 'Xbox 360', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' }
    const result = ingestRawBatch(db, category, [rawItem])
    expect(result.inserted).toBe(1)

    const details = detailsRepo.getByItemId(db, 'topic_5555555')
    expect(details).not.toBeNull()
    expect(Array.isArray(details.fileList)).toBe(true)
    expect(details.fileList).toEqual(['game.iso', 'update.xex', 'readme.txt'])

    const resolved = resolveTorrentDisplayData({
      catalog: {
        fileList: details.fileList,
      },
      torrentMetadata: null,
    })
    expect(resolved.files).toHaveLength(3)
    expect(resolved.files![0].name).toBe('game.iso')
    expect(resolved.files![1].name).toBe('update.xex')
    expect(resolved.files![2].name).toBe('readme.txt')
  })

  it('safeJsonParse falls back cleanly when existing database has unescaped multiline text', () => {
    db._items.set('topic_legacy_raw', {
      id: 'topic_legacy_raw',
      category_id: 'xbox',
      title: 'Legacy Raw Item',
    })
    db._itemDetails.set('topic_legacy_raw', {
      item_id: 'topic_legacy_raw',
      file_list_json: 'file_a.bin\nfile_b.bin',
    })

    const details = detailsRepo.getByItemId(db, 'topic_legacy_raw')
    expect(details).not.toBeNull()
    expect(Array.isArray(details.fileList)).toBe(true)
    expect(details.fileList).toEqual(['file_a.bin', 'file_b.bin'])
  })

  it('returns empty array cleanly when item has no files without throwing or inventing files', () => {
    db._items.set('topic_no_files', {
      id: 'topic_no_files',
      category_id: 'switch',
      title: 'Game Without Files',
    })
    db._itemDetails.set('topic_no_files', {
      item_id: 'topic_no_files',
      file_list_json: null,
    })

    const details = detailsRepo.getByItemId(db, 'topic_no_files')
    expect(details).not.toBeNull()
    expect(details.fileList).toEqual([])

    const resolved = resolveTorrentDisplayData({
      catalog: { fileList: details.fileList },
      torrentMetadata: null,
    })
    expect(resolved.files).toBeNull()
    expect(resolved.filesSource).toBeNull()
  })
})
