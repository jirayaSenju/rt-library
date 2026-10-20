import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "@/App";
import { I18nProvider } from "@/i18n/I18nContext";

const renderApp = () => {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );
};

describe("Tools Navigation Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("navigates from Library to Tools view via Sidebar and returns to Library", async () => {
    const user = userEvent.setup();
    renderApp();

    // 1. Initial State: Catalog is loaded
    await waitFor(() => {
      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument();
    });

    // 2. Find Tools entry in sidebar
    const toolsBtn = screen.getByTestId("sidebar-tools-button");
    expect(toolsBtn).toBeInTheDocument();
    expect(toolsBtn).toHaveTextContent(/Tools|Ferramentas|Инструменты/i);

    // 3. Click Tools button
    await user.click(toolsBtn);

    // Verify Tools view renders
    await waitFor(() => {
      expect(screen.getByTestId("tools-grid")).toBeInTheDocument();
    });
    expect(screen.getByText("NSCB Desktop")).toBeInTheDocument();
    expect(screen.getByText("NX Firmware")).toBeInTheDocument();
    expect(screen.getByText("Keys")).toBeInTheDocument();

    // 4. Return to Library by clicking "All Games" in sidebar
    const allGamesBtn = screen.getByRole("button", { name: /all games|todos os jogos|все игры/i });
    await user.click(allGamesBtn);

    // Verify Catalog view is back
    await waitFor(() => {
      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("tools-grid")).not.toBeInTheDocument();
  });

  it("retains accessible Tools button when Sidebar is collapsed", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument();
    });

    // Collapse sidebar
    const collapseBtn = screen.getByRole("button", { name: /collapse sidebar|recolher barra lateral/i });
    await user.click(collapseBtn);

    // Tools button is still in DOM in collapsed state
    const toolsBtn = screen.getByTestId("sidebar-tools-button");
    expect(toolsBtn).toBeInTheDocument();

    // Clicking it still opens Tools view
    await user.click(toolsBtn);

    await waitFor(() => {
      expect(screen.getByTestId("tools-grid")).toBeInTheDocument();
    });
  });
});

