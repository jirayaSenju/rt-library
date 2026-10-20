import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolsView } from "@/components/tools/ToolsView";
import { BUILTIN_TOOLS_REGISTRY } from "@/components/tools/toolsRegistry";
import { I18nProvider } from "@/i18n/I18nContext";
import { mockElectronBridge } from "../setup";
import { en as enTranslations } from "@/i18n/translations/en";
import { ptBR as ptBRTranslations } from "@/i18n/translations/pt-BR";
import { ruRU as ruRUTranslations } from "@/i18n/translations/ru-RU";

const renderToolsView = (locale: "en" | "pt-BR" | "ru-RU" = "en") => {
  localStorage.setItem("rt_library_locale", locale);
  return render(
    <I18nProvider>
      <ToolsView />
    </I18nProvider>
  );
};

describe("ToolsHub Component & Registry Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("Registry Configuration & Integrity", () => {
    it("contains exactly the three configured tools", () => {
      expect(BUILTIN_TOOLS_REGISTRY).toHaveLength(3);
      const ids = BUILTIN_TOOLS_REGISTRY.map((t) => t.id);
      expect(ids).toEqual(["nscb-desktop", "nx-firmware", "keys"]);
    });

    it("has exact required external URLs with HTTPS", () => {
      const nscb = BUILTIN_TOOLS_REGISTRY.find((t) => t.id === "nscb-desktop");
      const nx = BUILTIN_TOOLS_REGISTRY.find((t) => t.id === "nx-firmware");
      const keys = BUILTIN_TOOLS_REGISTRY.find((t) => t.id === "keys");

      expect(nscb?.url).toBe("https://github.com/cxfcxf/nscb-desktop");
      expect(nx?.url).toBe("https://github.com/THZoria/NX_Firmware/releases");
      expect(keys?.url).toBe("https://edenprodkeys.com/");

      BUILTIN_TOOLS_REGISTRY.forEach((t) => {
        expect(t.url.startsWith("https://")).toBe(true);
      });
    });

    it("has valid categories and sourceTypes assigned", () => {
      const nscb = BUILTIN_TOOLS_REGISTRY.find((t) => t.id === "nscb-desktop");
      const nx = BUILTIN_TOOLS_REGISTRY.find((t) => t.id === "nx-firmware");
      const keys = BUILTIN_TOOLS_REGISTRY.find((t) => t.id === "keys");

      expect(nscb?.category).toBe("converter");
      expect(nscb?.sourceType).toBe("github");

      expect(nx?.category).toBe("firmware");
      expect(nx?.sourceType).toBe("releases");

      expect(keys?.category).toBe("resources");
      expect(keys?.sourceType).toBe("resource");
    });
  });

  describe("Visual Rendering & Elements", () => {
    it("renders title, subtitle, and all three cards", () => {
      renderToolsView("en");

      expect(screen.getByRole("heading", { name: "Tools", level: 1 })).toBeInTheDocument();
      expect(
        screen.getByText("Quick access to useful external tools and resources.")
      ).toBeInTheDocument();

      expect(screen.getByText("NSCB Desktop")).toBeInTheDocument();
      expect(screen.getByText("NX Firmware")).toBeInTheDocument();
      expect(screen.getByText("Keys")).toBeInTheDocument();

      // Domain indicators
      expect(screen.getAllByText("github.com")).toHaveLength(2);
      expect(screen.getByText("edenprodkeys.com")).toBeInTheDocument();
    });

    it("renders disclaimers regarding third-party external resources", () => {
      renderToolsView("en");

      expect(
        screen.getByText(
          "External tools and resources are maintained by third parties and are not affiliated with RT-Library."
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Use external resources only with content and hardware you are authorized to use."
        )
      ).toBeInTheDocument();
    });
  });

  describe("Interaction & Security Execution", () => {
    it("calls openExternal bridge with tool ID on click", async () => {
      const user = userEvent.setup();
      renderToolsView("en");

      const nscbCard = screen.getByTestId("tool-card-nscb-desktop");
      await user.click(nscbCard);

      expect(mockElectronBridge.tools.openExternal).toHaveBeenCalledWith({
        toolId: "nscb-desktop",
        url: "https://github.com/cxfcxf/nscb-desktop",
      });
    });

    it("activates via keyboard Enter key", async () => {
      const user = userEvent.setup();
      renderToolsView("en");

      const nxCard = screen.getByTestId("tool-card-nx-firmware");
      nxCard.focus();
      expect(nxCard).toHaveFocus();

      await user.keyboard("{Enter}");

      expect(mockElectronBridge.tools.openExternal).toHaveBeenCalledWith({
        toolId: "nx-firmware",
        url: "https://github.com/THZoria/NX_Firmware/releases",
      });
    });

    it("activates Keys tool via Space key", async () => {
      const user = userEvent.setup();
      renderToolsView("en");

      const keysCard = screen.getByTestId("tool-card-keys");
      keysCard.focus();
      expect(keysCard).toHaveFocus();

      await user.keyboard(" ");

      expect(mockElectronBridge.tools.openExternal).toHaveBeenCalledWith({
        toolId: "keys",
        url: "https://edenprodkeys.com/",
      });
    });
  });

  describe("i18n Localization Across Languages", () => {
    it("renders complete Portuguese (pt-BR) translations", () => {
      renderToolsView("pt-BR");

      expect(screen.getByRole("heading", { name: "Ferramentas", level: 1 })).toBeInTheDocument();
      expect(
        screen.getByText("Acesso rápido a ferramentas e recursos externos úteis.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Conversão e gerenciamento de formatos Nintendo Switch.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Acesse as releases disponíveis de firmware.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Abrir recurso externo configurado.")
      ).toBeInTheDocument();
    });

    it("renders complete Russian (ru-RU) translations", () => {
      renderToolsView("ru-RU");

      expect(screen.getByRole("heading", { name: "Инструменты", level: 1 })).toBeInTheDocument();
      expect(
        screen.getByText("Быстрый доступ к полезным внешним инструментам и ресурсам.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Конвертация и управление форматами пакетов Nintendo Switch.")
      ).toBeInTheDocument();
    });

    it("validates that all required translation keys exist across en, pt-BR, and ru-RU dictionaries", () => {
      const requiredToolsKeys = [
        "title",
        "subtitle",
        "disclaimer",
        "disclaimerAuth",
        "openInBrowser",
        "openError",
      ];

      for (const key of requiredToolsKeys) {
        expect((enTranslations.tools as any)[key]).toBeTruthy();
        expect((ptBRTranslations.tools as any)[key]).toBeTruthy();
        expect((ruRUTranslations.tools as any)[key]).toBeTruthy();
      }

      expect(enTranslations.navigation.tools).toBe("Tools");
      expect(ptBRTranslations.navigation.tools).toBe("Ferramentas");
      expect(ruRUTranslations.navigation.tools).toBe("Инструменты");
    });
  });
});
