import { describe, expect, it } from 'vitest';

const itemsRepo = require('../../electron/database/repositories/itemsRepo.cjs');

function createQueryDb() {
  const queries: Array<{ sql: string; args: any[]; method: string }> = [];
  return {
    queries,
    db: {
      prepare(sql: string) {
        return {
          get(...args: any[]) {
            queries.push({ sql, args, method: 'get' });
            return { total: 0 };
          },
          all(...args: any[]) {
            queries.push({ sql, args, method: 'all' });
            return [];
          },
          run(...args: any[]) {
            queries.push({ sql, args, method: 'run' });
            return { changes: 0 };
          },
        };
      },
    },
  };
}

describe('Nintendo Switch virtual category queries', () => {
  it('counts both views from physical category switch using forum topic_title', () => {
    const { db, queries } = createQueryDb();

    itemsRepo.countByCategory(db, 'switch');
    itemsRepo.countByCategory(db, 'switch-ports');

    expect(queries[0].args).toEqual(['switch']);
    expect(queries[0].sql).toContain('category_id = ?');
    expect(queries[0].sql).toContain("NOT (instr(replace(");
    expect(queries[0].sql).toContain("OR instr(replace(");
    expect(queries[0].sql).toContain("'порт') > 0");
    expect(queries[0].sql).toContain("'хоумбрю') > 0)");
    expect(queries[1].args).toEqual(['switch']);
    expect(queries[1].sql).toContain("instr(replace(");
    expect(queries[1].sql).toContain("OR instr(replace(");
    expect(queries[1].sql).not.toContain('NOT ((instr');
    expect(queries[1].sql).not.toContain('lower(');
  });

  it('applies virtual category constraints before search results are counted and paginated', () => {
    const { db, queries } = createQueryDb();

    itemsRepo.getPaginated(db, { categoryId: 'switch-ports', search: 'Mario', limit: 10, offset: 20 });

    const [countQuery, itemsQuery] = queries;
    expect(countQuery.args[0][0]).toBe('switch');
    expect(countQuery.sql).toContain("instr(replace(");
    expect(countQuery.sql).toContain('items.canonical_title LIKE');
    expect(itemsQuery.args[0][0]).toBe('switch');
    expect(itemsQuery.sql).toContain("instr(replace(");
    expect(itemsQuery.sql.indexOf("instr(replace(")).toBeLessThan(itemsQuery.sql.indexOf('LIMIT ? OFFSET ?'));
    expect(itemsQuery.args[0].slice(-2)).toEqual([10, 20]);
  });

  it('scopes facets and known topic IDs to the physical Switch set', () => {
    const { db, queries } = createQueryDb();

    itemsRepo.getFilterFacets(db, { categoryId: 'switch-ports' });
    const facetQueries = queries.splice(0);
    expect(facetQueries.length).toBeGreaterThan(1);
    expect(facetQueries.every(({ sql, args }) => sql.includes("instr(replace(") && args.includes('switch'))).toBe(true);

    itemsRepo.getKnownTopicIds(db, 'rutracker', 'switch-ports');
    expect(queries[0].args).toEqual(['rutracker', 'switch']);
  });

  it('leaves other categories unfiltered and rejects deletion of the virtual view', () => {
    const { db, queries } = createQueryDb();

    itemsRepo.getPaginated(db, { categoryId: 'ps2' });
    expect(queries[0].args[0][0]).toBe('ps2');
    expect(queries[0].sql).not.toContain("'порт'");
    expect(() => itemsRepo.deleteByCategory(db, 'switch-ports')).toThrow(/virtual Nintendo Switch Ports/);

    itemsRepo.deleteByCategory(db, 'switch');
    expect(queries.find(({ method }) => method === 'run')?.args).toEqual(['switch']);
  });

  it('keeps ALL and global Favorites outside the virtual category filters', () => {
    const { db, queries } = createQueryDb();

    itemsRepo.getPaginated(db, { categoryId: 'all' });
    const allQuery = queries[0];
    expect(allQuery.sql).not.toContain('category_id = ?');
    expect(allQuery.sql).not.toContain("'порт'");

    itemsRepo.getPaginated(db, { categoryId: 'favorites' });
    const favoritesQuery = queries[2];
    expect(favoritesQuery.sql).toContain('is_favorite = 1');
    expect(favoritesQuery.sql).not.toContain('category_id = ?');
    expect(favoritesQuery.sql).not.toContain("'порт'");
  });
});
