import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DatabaseSettings } from "@/components/settings/DatabaseSettings"
import { I18nProvider } from "@/i18n/I18nContext"

const getRows = vi.fn(async ({ offset }: { offset: number }) => ({
  rows: [{ id: offset + 1, title: `Item ${offset + 1}`, category_id: "xbox" }],
  total: 101,
  limit: 50,
  offset,
}))

describe("DatabaseSettings", () => {
  it("shows database overview and requests table pages from the Main process", async () => {
    Object.defineProperty(window, "rtLibrary", {
      configurable: true,
      value: {
        database: {
          getOverview: async () => ({
            path: "/user-data/catalog.sqlite",
            schemaVersion: 5,
            sqliteVersion: "3.46",
            journalMode: "wal",
            size: 2048,
            walSize: 1024,
            tableCount: 2,
            indexCount: 3,
            itemCount: 101,
            health: "Healthy",
            lastIntegrityCheck: null,
            largestTables: [{ name: "items", rowCount: 101 }],
            scheduleStatus: { enabled: true, retentionCount: 7, nextRun: "2026-10-07T03:00:00.000Z" },
            recentOperations: [],
          }),
          getTables: async () => [
            {
              name: "items",
              rows: 101,
              columns: [
                { name: "id", type: "TEXT", nullable: false, primaryKey: true },
                { name: "title", type: "TEXT", nullable: false, primaryKey: false },
              ],
              indexes: [],
              sql: "CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT)",
            },
          ],
          getRows,
          getBackupSchedule: async () => ({ enabled: true, retentionCount: 7 }),
          getBackupHistory: async () => [],
        },
      },
    })
    render(<I18nProvider><DatabaseSettings /></I18nProvider>)

    expect(await screen.findByText("/user-data/catalog.sqlite")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: /Tabelas|Tables/i }))
    expect(await screen.findByText("Item 1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Próxima|Next/i }))
    await waitFor(() => expect(getRows).toHaveBeenLastCalledWith(expect.objectContaining({ table: "items", offset: 50, limit: 50 })))
  })

  it("handles query execution, integrity check, and backup actions", async () => {
    const executeReadQuery = vi.fn(async () => ({ columns: ["count"], rows: [{ count: 42 }], rowCount: 1, executionTimeMs: 4 }))
    const integrityCheck = vi.fn(async () => ({ check: "quick_check", results: ["ok"], foreignKeys: [], checkedAt: "2026-10-06T18:00:00.000Z" }))
    const createBackup = vi.fn(async () => ({ canceled: false, size: 2048 }))
    const checkpoint = vi.fn(async () => ({ before: 1024, after: 0, result: 0 }))
    const optimize = vi.fn(async () => ({ success: true, durationMs: 12 }))

    Object.defineProperty(window, "rtLibrary", {
      configurable: true,
      value: {
        database: {
          getOverview: async () => ({
            path: "/user-data/catalog.sqlite",
            schemaVersion: 5,
            sqliteVersion: "3.46",
            journalMode: "wal",
            size: 2048,
            walSize: 1024,
            tableCount: 2,
            indexCount: 3,
            itemCount: 101,
            health: "Healthy",
            lastIntegrityCheck: null,
            largestTables: [{ name: "items", rowCount: 101 }],
            scheduleStatus: { enabled: true, retentionCount: 7 },
            recentOperations: [],
          }),
          getTables: async () => [
            {
              name: "items",
              rows: 101,
              columns: [{ name: "id", type: "TEXT", nullable: false, primaryKey: true }],
              indexes: [],
              sql: "CREATE TABLE items",
            },
          ],
          getRows,
          executeReadQuery,
          integrityCheck,
          createBackup,
          checkpoint,
          optimize,
          getBackupSchedule: async () => ({ enabled: true, retentionCount: 7 }),
          getBackupHistory: async () => [],
        },
      },
    })

    render(<I18nProvider><DatabaseSettings /></I18nProvider>)

    // Test Integrity Check
    const quickCheckBtn = await screen.findByRole("button", { name: /Verificação rápida|Quick Check/i })
    fireEvent.click(quickCheckBtn)
    await waitFor(() => expect(integrityCheck).toHaveBeenCalledWith(false))

    // Test Query Console Tab
    fireEvent.click(screen.getByRole("tab", { name: /Console de consultas|Query Console/i }))
    const runQueryBtn = await screen.findByRole("button", { name: /Executar consulta|Run Query/i })
    fireEvent.click(runQueryBtn)
    await waitFor(() => expect(executeReadQuery).toHaveBeenCalled())

    // Test Backup Tab
    fireEvent.click(screen.getByRole("tab", { name: /Backup/i }))
    const createBackupBtn = await screen.findAllByRole("button", { name: /Criar backup|Create Backup/i })
    fireEvent.click(createBackupBtn[0])
    await waitFor(() => expect(createBackup).toHaveBeenCalled())

    // Test Maintenance Tab
    fireEvent.click(screen.getByRole("tab", { name: /Manutenção|Maintenance/i }))
    const checkpointBtn = await screen.findByRole("button", { name: /Checkpoint/i })
    fireEvent.click(checkpointBtn)
    await waitFor(() => expect(checkpoint).toHaveBeenCalled())
  })
})
