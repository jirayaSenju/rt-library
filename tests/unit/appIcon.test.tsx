import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { getThemeIconFilename, applyTheme } from "@/theme/themes"
import { Sidebar } from "@/components/layout/Sidebar"
import { I18nProvider } from "@/i18n"

describe("Dynamic App Icon by Theme", () => {
  beforeEach(() => {
    document.head.innerHTML = '<link rel="icon" type="image/png" href="/app-icon.png" />'
    ;(window as any).rtLibrary = {
      window: {
        setIcon: vi.fn(),
      },
    }
  })

  it("resolves correct icon filename based on theme id", () => {
    expect(getThemeIconFilename("eco-green")).toBe("ecologica_verde.png")
    expect(getThemeIconFilename("eco-red")).toBe("ecologica_vermelha.png")
    expect(getThemeIconFilename("rt-dark")).toBe("app-icon.png")
    expect(getThemeIconFilename("cyberpunk")).toBe("app-icon.png")
    expect(getThemeIconFilename(undefined)).toBe("app-icon.png")
  })

  it("updates DOM favicon and calls window.setIcon when applying theme", () => {
    applyTheme("eco-green")
    const favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
    expect(favicon?.href).toContain("ecologica_verde.png")
    expect((window as any).rtLibrary.window.setIcon).toHaveBeenCalledWith("ecologica_verde.png")

    applyTheme("eco-red")
    expect(favicon?.href).toContain("ecologica_vermelha.png")
    expect((window as any).rtLibrary.window.setIcon).toHaveBeenCalledWith("ecologica_vermelha.png")

    applyTheme("rt-dark")
    expect(favicon?.href).toContain("app-icon.png")
    expect((window as any).rtLibrary.window.setIcon).toHaveBeenCalledWith("app-icon.png")
  })

  it("Sidebar renders respective icon depending on themeId prop", () => {
    const { rerender } = render(
      <I18nProvider>
        <Sidebar
          categories={[]}
          selectedCategory=""
          onSelectCategory={vi.fn()}
          totalItemsCount={0}
          favoritesCount={0}
          themeId="eco-green"
        />
      </I18nProvider>
    )

    const img = screen.getByAltText("RT Library Logo") as HTMLImageElement
    expect(img.src).toContain("ecologica_verde")

    rerender(
      <I18nProvider>
        <Sidebar
          categories={[]}
          selectedCategory=""
          onSelectCategory={vi.fn()}
          totalItemsCount={0}
          favoritesCount={0}
          themeId="eco-red"
        />
      </I18nProvider>
    )
    expect(img.src).toContain("ecologica_vermelha")

    rerender(
      <I18nProvider>
        <Sidebar
          categories={[]}
          selectedCategory=""
          onSelectCategory={vi.fn()}
          totalItemsCount={0}
          favoritesCount={0}
          themeId="rt-dark"
        />
      </I18nProvider>
    )
    expect(img.src).toContain("app-icon")
  })
})
