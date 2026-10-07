import React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ImageSettings } from "@/components/settings/ImageSettings"
import { imageCacheService } from "@/services/imageCache"
import { I18nProvider } from "@/i18n/I18nContext"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("ImageSettings integration tests (V3-16)", () => {
  beforeEach(async () => {
    localStorage.clear()
    await imageCacheService.clear().catch(() => {})
  })

  it("renders ImageSettings with cache overview, breakdown, policy, and maintenance sections", async () => {
    renderWithI18n(<ImageSettings />)

    // 1. Overview
    expect(await screen.findByText(/uso do cache|cache overview/i)).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
    expect(screen.getByText(/saudável|healthy/i)).toBeInTheDocument()

    // 2. Storage Breakdown
    expect(screen.getByText(/detalhamento do armazenamento|storage breakdown/i)).toBeInTheDocument()
    expect(screen.getAllByText(/^capas$|^covers$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^screenshots$/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/^falhas$|^failed$/i)).toBeInTheDocument()
    expect(screen.getByText(/^expirados$|^expired$/i)).toBeInTheDocument()

    // 3. Cache Policy
    expect(screen.getByText(/política de cache|cache policy/i)).toBeInTheDocument()
    expect(screen.getByText(/tamanho máximo|maximum cache/i)).toBeInTheDocument()
    expect(screen.getByText(/limpeza automática|automatic cleanup/i)).toBeInTheDocument()
    expect(screen.getByText(/^alvo pós-limpeza$|^target after cleanup$/i)).toBeInTheDocument()
    expect(screen.getByText(/^limite por imagem$|^single image limit$/i)).toBeInTheDocument()

    // 4. Maintenance
    expect(screen.getByText(/manutenção & limpeza|maintenance & cleanup/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /limpar capas|clear covers/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /limpar screenshots|clear screenshots/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /limpar falhas|clear failed/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /executar limpeza|run cleanup/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /limpar todo o cache|clear all cache/i })).toBeInTheDocument()

    // 5. Diagnostics Collapsible
    expect(screen.getByText(/diagnóstico do cache de imagens|image cache diagnostics/i)).toBeInTheDocument()
  })

  it("updates policy preset selection when clicking max size buttons", async () => {
    const user = userEvent.setup()
    renderWithI18n(<ImageSettings />)

    const btn1GB = await screen.findByRole("button", { name: "1 GB" })
    await user.click(btn1GB)

    expect(imageCacheService.getPolicy().maxSizeBytes).toBe(1024 * 1024 * 1024)
  })

  it("expands diagnostics section and displays IndexedDB status", async () => {
    const user = userEvent.setup()
    renderWithI18n(<ImageSettings />)

    const diagHeader = await screen.findByText(/diagnóstico do cache de imagens|image cache diagnostics/i)
    await user.click(diagHeader)

    expect(screen.getByText(/status do indexeddb|indexeddb status/i)).toBeInTheDocument()
    expect(screen.getByText(/conectado \(saudável\)|connected \(healthy\)/i)).toBeInTheDocument()
    expect(screen.getByText("v3")).toBeInTheDocument()
  })

  it("opens confirmation dialog when clicking Clear All Cache", async () => {
    const user = userEvent.setup()

    // Insert mock blob to enable clear button
    await imageCacheService.putBlob("https://test.jpg", new Blob(["test"]))

    renderWithI18n(<ImageSettings />)

    const clearAllBtn = await screen.findByRole("button", { name: /limpar todo o cache|clear all cache/i })
    await user.click(clearAllBtn)

    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/limpar todo o cache de imagens\?|clear image cache\?/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/isso remove capas e screenshots armazenadas localmente|this removes locally cached covers and screenshots/i)
    ).toBeInTheDocument()
  })

  it("renders Generate Image Cache section and triggers generation", async () => {
    const user = userEvent.setup()
    renderWithI18n(<ImageSettings />)

    // Verify section header and controls
    expect(screen.getByText(/gerar cache de imagens|generate image cache/i)).toBeInTheDocument()
    expect(screen.getByText(/escopo de geração|generation scope/i)).toBeInTheDocument()
    expect(screen.getByText(/pular imagens já em cache|skip already cached images/i)).toBeInTheDocument()

    const startBtn = screen.getByRole("button", { name: /gerar cache|generate cache/i })
    expect(startBtn).toBeInTheDocument()

    // Click start generation
    await user.click(startBtn)
  })
})
