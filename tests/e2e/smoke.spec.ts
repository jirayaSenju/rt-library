import { test, expect, _electron as electron, ElectronApplication, Page } from "playwright/test"
import path from "path"
import os from "os"
import fs from "fs"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe("Electron Smoke Tests", () => {
  let electronApp: ElectronApplication
  let page: Page
  let tempUserDataDir: string

  test.beforeAll(async () => {
    // Create isolated temporary directory for test userData
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-library-e2e-"))

    const mockLibDir = path.join(tempUserDataDir, "mock-library")
    fs.mkdirSync(mockLibDir, { recursive: true })

    // Seed mock config so the main application shell (sidebar, topbar, views) is rendered
    fs.writeFileSync(
      path.join(tempUserDataDir, "config.json"),
      JSON.stringify({ libraryPath: mockLibDir }, null, 2),
      "utf-8"
    )

    const testEnv = { ...process.env, NODE_ENV: "test", RT_LIBRARY_USER_DATA_DIR: tempUserDataDir }
    delete testEnv.ELECTRON_RUN_AS_NODE

    const launchArgs = [
      path.join(__dirname, "../../electron/main.cjs"),
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ]
    if (!process.env.DISPLAY && process.platform === "linux") {
      launchArgs.push("--headless=new", "--ozone-platform=headless", "--disable-gpu")
    }

    // Launch electron application pointing to project root with full isolation
    electronApp = await electron.launch({
      args: launchArgs,
      env: testEnv,
    })

    // Wait for the first BrowserWindow to open
    page = await electronApp.firstWindow()
    await page.waitForLoadState("domcontentloaded")
  })

  test.afterAll(async () => {
    if (electronApp) {
      try {
        await electronApp.close()
      } catch (_) {}
    }
    if (tempUserDataDir && fs.existsSync(tempUserDataDir)) {
      try {
        fs.rmSync(tempUserDataDir, { recursive: true, force: true })
      } catch (_) {}
    }
  })

  test("launches application and displays RT Library header", async () => {
    const title = await page.title()
    expect(title).toBeDefined()

    // Verify main app brand title or onboarding header
    const brandHeading = page.locator("h1", { hasText: "RT Library" })
    await expect(brandHeading).toBeVisible()
  })

  test("renders sidebar and supports collapse toggle", async () => {
    const sidebar = page.locator("aside")
    await expect(sidebar).toBeVisible()

    const collapseBtn = page.getByRole("button", { name: /barra lateral/i })
    await expect(collapseBtn).toBeVisible()
    await collapseBtn.click()

    // Verify sidebar collapsed width transition
    await expect(sidebar).toHaveClass(/w-\[68px\]/)

    // Expand sidebar back
    await collapseBtn.click()
    await expect(sidebar).toHaveClass(/w-64/)
  })

  test("toggles view modes between Grid and List", async () => {
    const listToggleBtn = page.getByRole("button", { name: /alternar para lista/i })
    if (await listToggleBtn.isVisible()) {
      await listToggleBtn.click()
      const gridToggleBtn = page.getByRole("button", { name: /alternar para grade/i })
      await expect(gridToggleBtn).toBeVisible()
      await gridToggleBtn.click()
      await expect(listToggleBtn).toBeVisible()
    }
  })
})
