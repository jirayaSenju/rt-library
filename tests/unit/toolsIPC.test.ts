import { describe, it, expect, vi, beforeEach } from "vitest";
const {
  validateToolUrl,
  registerToolsIPCHandlers,
  BUILTIN_TOOLS,
  ALLOWED_HOSTS,
} = require("../../electron/ipc/toolsIPC.cjs");

describe("toolsIPC Backend Security & Handler Tests", () => {
  describe("validateToolUrl URL and Protocol Validation", () => {
    it("allows valid HTTPS URLs from allowed domains", () => {
      const nscbRes = validateToolUrl("https://github.com/cxfcxf/nscb-desktop");
      expect(nscbRes.valid).toBe(true);

      const nxRes = validateToolUrl("https://github.com/THZoria/NX_Firmware/releases");
      expect(nxRes.valid).toBe(true);

      const keysRes = validateToolUrl("https://edenprodkeys.com/");
      expect(keysRes.valid).toBe(true);
    });

    it("allows subdomains of allowed hosts", () => {
      const subRes = validateToolUrl("https://sub.github.com/some/repo");
      expect(subRes.valid).toBe(true);
    });

    it("rejects non-HTTPS protocols (HTTP, FTP)", () => {
      const httpRes = validateToolUrl("http://github.com/cxfcxf/nscb-desktop");
      expect(httpRes.valid).toBe(false);
      expect(httpRes.error).toBe("HTTPS_REQUIRED");

      const ftpRes = validateToolUrl("ftp://edenprodkeys.com/file");
      expect(ftpRes.valid).toBe(false);
      expect(ftpRes.error).toBe("HTTPS_REQUIRED");
    });

    it("strictly blocks malicious protocols (javascript, file, cmd, powershell, data)", () => {
      const jsRes = validateToolUrl("javascript:alert(1)");
      expect(jsRes.valid).toBe(false);
      expect(jsRes.error).toBe("DISALLOWED_PROTOCOL");

      const fileRes = validateToolUrl("file:///etc/passwd");
      expect(fileRes.valid).toBe(false);
      expect(fileRes.error).toBe("DISALLOWED_PROTOCOL");

      const cmdRes = validateToolUrl("cmd://calc.exe");
      expect(cmdRes.valid).toBe(false);
      expect(cmdRes.error).toBe("DISALLOWED_PROTOCOL");

      const psRes = validateToolUrl("powershell://invoke-expression");
      expect(psRes.valid).toBe(false);
      expect(psRes.error).toBe("DISALLOWED_PROTOCOL");

      const dataRes = validateToolUrl("data:text/html,<script>alert(1)</script>");
      expect(dataRes.valid).toBe(false);
      expect(dataRes.error).toBe("DISALLOWED_PROTOCOL");
    });

    it("rejects domains not in allowlist", () => {
      const disallowed = validateToolUrl("https://malicious-site.com/keys");
      expect(disallowed.valid).toBe(false);
      expect(disallowed.error).toBe("HOST_NOT_ALLOWED");

      const fakeGithub = validateToolUrl("https://notgithub.com");
      expect(fakeGithub.valid).toBe(false);
      expect(fakeGithub.error).toBe("HOST_NOT_ALLOWED");
    });

    it("rejects invalid, malformed, or empty inputs", () => {
      expect(validateToolUrl("").valid).toBe(false);
      expect(validateToolUrl(null as any).valid).toBe(false);
      expect(validateToolUrl("not a valid url").valid).toBe(false);
    });
  });

  describe("registerToolsIPCHandlers IPC Execution", () => {
    let handlers: Record<string, Function>;
    let mockIpcMain: { handle: any };
    let mockShell: { openExternal: any };

    beforeEach(() => {
      handlers = {};
      mockIpcMain = {
        handle: vi.fn((channel: string, handler: Function) => {
          handlers[channel] = handler;
        }),
      };
      mockShell = {
        openExternal: vi.fn(async () => {}),
      };

      registerToolsIPCHandlers(mockIpcMain, mockShell);
    });

    it("registers tools:open-external and tools:get-registry channels", () => {
      expect(handlers["tools:open-external"]).toBeDefined();
      expect(handlers["tools:get-registry"]).toBeDefined();
    });

    it("opens registered tool by ID successfully", async () => {
      const res = await handlers["tools:open-external"]({}, "nscb-desktop");
      expect(res).toEqual({ success: true });
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://github.com/cxfcxf/nscb-desktop");
    });

    it("opens registered tool when payload object is passed", async () => {
      const res = await handlers["tools:open-external"]({}, { toolId: "nx-firmware" });
      expect(res).toEqual({ success: true });
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://github.com/THZoria/NX_Firmware/releases");
    });

    it("opens registered keys tool with exact URL", async () => {
      const res = await handlers["tools:open-external"]({}, "keys");
      expect(res).toEqual({ success: true });
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://edenprodkeys.com/");
    });

    it("rejects unknown tool ID", async () => {
      const res = await handlers["tools:open-external"]({}, "unknown-tool-id");
      expect(res).toEqual({ success: false, error: "UNKNOWN_TOOL" });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("rejects URL mismatch when payload attempts to alter canonical tool URL", async () => {
      const res = await handlers["tools:open-external"](
        {},
        { toolId: "keys", url: "https://evil-keys.com" }
      );
      expect(res).toEqual({ success: false, error: "URL_MISMATCH" });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("handles shell.openExternal failure gracefully without throwing raw stack", async () => {
      mockShell.openExternal = vi.fn(async () => {
        throw new Error("OS handler missing");
      });

      const res = await handlers["tools:open-external"]({}, "nscb-desktop");
      expect(res).toEqual({ success: false, error: "OPEN_FAILED" });
    });

    it("returns all built-in tools through get-registry", async () => {
      const registry = await handlers["tools:get-registry"]({});
      expect(registry).toHaveLength(3);
      expect(registry.map((t: any) => t.id)).toEqual(["nscb-desktop", "nx-firmware", "keys"]);
    });
  });
});

