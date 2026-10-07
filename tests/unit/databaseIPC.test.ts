import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn(),
  }
})

const { validateReadQuery, collectRows } = require("../../electron/ipc/databaseIPC.cjs")

describe("database IPC read query safeguards", () => {
  afterEach(() => vi.clearAllMocks())

  it("accepts read-only SELECT, EXPLAIN, CTE SELECT, and approved PRAGMA statements", () => {
    expect(validateReadQuery("SELECT 1").statement).toBe("SELECT 1")
    expect(validateReadQuery("EXPLAIN QUERY PLAN SELECT 1").statement).toContain("EXPLAIN")
    expect(validateReadQuery("WITH x AS (SELECT 1 AS n) SELECT * FROM x").statement).toContain("WITH")
    expect(validateReadQuery("PRAGMA user_version").pragma).toBe(true)
  })

  it.each([
    "DELETE FROM items",
    "WITH gone AS (SELECT 1) DELETE FROM items",
    "INSERT INTO items (id) VALUES ('1')",
    "UPDATE items SET title = 'x'",
    "DROP TABLE items",
    "ALTER TABLE items ADD COLUMN x TEXT",
    "CREATE TABLE test (id TEXT)",
    "PRAGMA writable_schema=ON",
    "PRAGMA journal_mode=DELETE",
    "SELECT 1; DELETE FROM items",
    "SELECT 1 -- comment",
    "/* comment */ SELECT 1",
  ])("blocks unsafe query: %s", (sql) => {
    expect(() => validateReadQuery(sql)).toThrow()
  })

  it("returns at most 500 rows", () => {
    const columns = [{ name: "n" }]
    const values = Array.from({ length: 501 }, (_, n) => [n])
    const result = collectRows({ columns: () => columns, raw: () => ({ iterate: () => values[Symbol.iterator]() }) })
    expect(result.rows).toHaveLength(500)
    expect(result.truncated).toBe(true)
  })

})
