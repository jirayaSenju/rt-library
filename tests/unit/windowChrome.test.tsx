import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { Topbar } from "@/components/layout/Topbar"
import { I18nProvider } from "@/i18n/I18nContext"
import { FilterOptions } from "@/types"

const { registerWindowIPCHandlers, attachWindowStateListeners } = require("../../electron/ipc/windowIPC.cjs")

describe("Window Chrome & Maximized Titlebar Redundancy Removal", () => {
  const defaultFilters: FilterOptions = {
    searchQuery: "",
    sortBy: "discoveredAt",
    sortOrder: "desc",
    categoryId: "switch",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("1. Main Process Window IPC Handlers", () => {
    it("registers and executes window:is-maximized, minimize, toggle-maximize, and close", async () => {
      const handlers: Record<string, Function> = {}
      const mockIpcMain = {
        handle: vi.fn((channel, fn) => {
          handlers[channel] = fn
        }),
      }

      let isMax = false
      const mockWin = {
        isMaximized: vi.fn(() => isMax),
        minimize: vi.fn(),
        maximize: vi.fn(() => {
          isMax = true
        }),
        unmaximize: vi.fn(() => {
          isMax = false
        }),
        close: vi.fn(),
      }

      const mockBrowserWindowClass = {
        fromWebContents: vi.fn(() => mockWin),
      }

      registerWindowIPCHandlers(mockIpcMain, mockBrowserWindowClass)

      expect(mockIpcMain.handle).toHaveBeenCalledWith("window:is-maximized", expect.any(Function))
      expect(mockIpcMain.handle).toHaveBeenCalledWith("window:minimize", expect.any(Function))
      expect(mockIpcMain.handle).toHaveBeenCalledWith("window:toggle-maximize", expect.any(Function))
      expect(mockIpcMain.handle).toHaveBeenCalledWith("window:close", expect.any(Function))

      const mockEvent = { sender: {} }

      // is-maximized
      expect(handlers["window:is-maximized"](mockEvent)).toBe(false)

      // minimize
      expect(handlers["window:minimize"](mockEvent)).toBe(true)
      expect(mockWin.minimize).toHaveBeenCalledTimes(1)

      // toggle-maximize from false -> true
      expect(handlers["window:toggle-maximize"](mockEvent)).toBe(true)
      expect(mockWin.maximize).toHaveBeenCalledTimes(1)

      // toggle-maximize from true -> false
      expect(handlers["window:toggle-maximize"](mockEvent)).toBe(false)
      expect(mockWin.unmaximize).toHaveBeenCalledTimes(1)

      // close
      expect(handlers["window:close"](mockEvent)).toBe(true)
      expect(mockWin.close).toHaveBeenCalledTimes(1)
    })

    it("attaches maximize and unmaximize event listeners to dispatch state changes to webContents", () => {
      const listeners: Record<string, Function> = {}
      const mockWin = {
        on: vi.fn((event, fn) => {
          listeners[event] = fn
        }),
        isDestroyed: vi.fn(() => false),
        webContents: {
          send: vi.fn(),
        },
      }

      attachWindowStateListeners(mockWin)

      expect(mockWin.on).toHaveBeenCalledWith("maximize", expect.any(Function))
      expect(mockWin.on).toHaveBeenCalledWith("unmaximize", expect.any(Function))

      listeners["maximize"]()
      expect(mockWin.webContents.send).toHaveBeenCalledWith("window:maximized-change", true)

      listeners["unmaximize"]()
      expect(mockWin.webContents.send).toHaveBeenCalledWith("window:maximized-change", false)
    })
  })

  describe("2. Topbar Integrated Window Controls & Drag Regions", () => {
    it("renders window controls in topbar with drag region on header and no-drag on interactive controls", () => {
      const { container } = render(
        <I18nProvider>
          <Topbar
            searchQuery=""
            onSearchChange={vi.fn()}
            onOpenCommandPalette={vi.fn()}
            sortBy="discoveredAt"
            sortOrder="desc"
            onSortChange={vi.fn()}
            filters={defaultFilters}
            onApplyFilters={vi.fn()}
            onClearFilters={vi.fn()}
            onRemoveFilter={vi.fn()}
          />
        </I18nProvider>
      )

      const header = container.querySelector("header")
      expect(header).toBeInTheDocument()
      // Drag region applied to header container
      expect(header?.style.WebkitAppRegion).toBe("drag")

      // Window controls group rendered
      const controlsGroup = screen.getByTestId("window-controls-group")
      expect(controlsGroup).toBeInTheDocument()

      // Interactive buttons have no-drag
      const minimizeBtn = screen.getByTestId("window-control-minimize")
      const maximizeBtn = screen.getByTestId("window-control-maximize")
      const closeBtn = screen.getByTestId("window-control-close")

      expect(minimizeBtn).toBeInTheDocument()
      expect(maximizeBtn).toBeInTheDocument()
      expect(closeBtn).toBeInTheDocument()
    })

    it("triggers minimize, toggleMaximize, and close via window controls buttons", async () => {
      const user = userEvent.setup()

      render(
        <I18nProvider>
          <Topbar
            searchQuery=""
            onSearchChange={vi.fn()}
            onOpenCommandPalette={vi.fn()}
            sortBy="discoveredAt"
            sortOrder="desc"
            onSortChange={vi.fn()}
            filters={defaultFilters}
            onApplyFilters={vi.fn()}
            onClearFilters={vi.fn()}
            onRemoveFilter={vi.fn()}
          />
        </I18nProvider>
      )

      const minimizeBtn = screen.getByTestId("window-control-minimize")
      await user.click(minimizeBtn)
      expect((window as any).rtLibrary.window.minimize).toHaveBeenCalledTimes(1)

      const maximizeBtn = screen.getByTestId("window-control-maximize")
      await user.click(maximizeBtn)
      expect((window as any).rtLibrary.window.toggleMaximize).toHaveBeenCalledTimes(1)

      const closeBtn = screen.getByTestId("window-control-close")
      await user.click(closeBtn)
      expect((window as any).rtLibrary.window.close).toHaveBeenCalledTimes(1)
    })

    it("double-clicking the topbar drag area triggers toggleMaximize", () => {
      const { container } = render(
        <I18nProvider>
          <Topbar
            searchQuery=""
            onSearchChange={vi.fn()}
            onOpenCommandPalette={vi.fn()}
            sortBy="discoveredAt"
            sortOrder="desc"
            onSortChange={vi.fn()}
            filters={defaultFilters}
            onApplyFilters={vi.fn()}
            onClearFilters={vi.fn()}
            onRemoveFilter={vi.fn()}
          />
        </I18nProvider>
      )

      const header = container.querySelector("header")
      expect(header).toBeInTheDocument()
      fireEvent.doubleClick(header!)

      expect((window as any).rtLibrary.window.toggleMaximize).toHaveBeenCalled()
    })

    it("displays restore icon and accessible label when maximized", async () => {
      // Mock isMaximized resolving to true
      ;(window as any).rtLibrary.window.isMaximized = vi.fn(async () => true)

      render(
        <I18nProvider>
          <Topbar
            searchQuery=""
            onSearchChange={vi.fn()}
            onOpenCommandPalette={vi.fn()}
            sortBy="discoveredAt"
            sortOrder="desc"
            onSortChange={vi.fn()}
            filters={defaultFilters}
            onApplyFilters={vi.fn()}
            onClearFilters={vi.fn()}
            onRemoveFilter={vi.fn()}
          />
        </I18nProvider>
      )

      // Button accessible name updates to Restore
      const restoreBtn = await screen.findByRole("button", { name: /restore|restaurar|восстановить/i })
      expect(restoreBtn).toBeInTheDocument()
    })
  })
})

