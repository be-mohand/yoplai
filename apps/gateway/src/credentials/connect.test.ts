import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { registerCredentialOAuthConnector, type CredentialOAuthConnectorOptions } from "@yoplai/shared";
import { listSettingsChanges } from "../audit/store.js";
import { credentialConnectHost } from "./connect.js";
import { getPersonalExtensionTokens } from "./extension-tokens.js";
import { CredentialStore } from "./store.js";

const state = vi.hoisted(() => {
  // Real config dir, credential store, extension tokens and audit DB live under a temp home.
  const home = `${process.env.TMPDIR ?? "/tmp"}/connect-test-${process.pid}`;
  process.env.YOPLAI_HOME = home;
  return {
    home,
    agent: { id: "sales", name: "sales", workspace: "/tmp/sales", extensions: { fixture: { enabled: true } } },
    extension: {
      id: "fixture", requiredSecrets: ["apiToken"],
      configJsonSchema: {
        required: ["username"],
        properties: { apiToken: { title: "API token", writeOnly: true }, optional: { writeOnly: true }, username: { type: "string" } },
      },
    },
    start: vi.fn(async (_options: Record<string, unknown>) => ({ authorizeUrl: "https://provider.test/authorize" })),
  };
});
vi.mock("../config/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/index.js")>()),
  getAgent: (id: string) => id === "sales" ? state.agent : undefined,
  loadConfig: () => ({ extensions: {} }),
}));
vi.mock("../extensions/registry.js", () => ({ getLoadedExtensions: () => [state.extension], isExtensionLoaded: () => false }));
vi.mock("../oauth/service.js", () => ({ getOAuthService: () => ({ startAuthorization: state.start }) }));
vi.mock("../oauth/encryption.js", async () => {
  const { TokenCipher } = await import("../oauth/crypto.js");
  return { resolveTokenCipher: () => new TokenCipher("connect-test-secret") };
});
const store = () => new CredentialStore();
afterEach(() => { vi.clearAllMocks(); fs.rmSync(path.join(state.home, "credentials"), { recursive: true, force: true }); });
afterAll(() => fs.rmSync(state.home, { recursive: true, force: true }));

describe("host single-pass credential connector", () => {
  it("starts host OAuth for the verified personal user with the completion callback", async () => {
    const options = { agentId: "sales", userId: "alice", onComplete: vi.fn(async () => {}) };
    await expect(credentialConnectHost.start({ kind: "oauth", provider: "google", scopes: ["gmail"] }, options)).resolves.toBe("https://provider.test/authorize");
    expect(state.start).toHaveBeenCalledWith({ ...options, provider: "google", scopes: ["gmail"], scope: "personal", onComplete: expect.any(Function) });
    const start = state.start.mock.calls[0] as unknown as [{ onComplete: () => Promise<void> }];
    await start[0].onComplete();
    expect(listSettingsChanges({ action: "oauth.connect" }).entries).toEqual([
      expect.objectContaining({ actorUserId: "alice", agentId: "sales", targetId: "google", scope: "personal" }),
    ]);
    expect(options.onComplete).toHaveBeenCalledOnce();
  });
  it("uses declared form fields and the validated personal writer", async () => {
    expect(await credentialConnectHost.fields("sales", "fixture")).toEqual([
      { name: "username", label: "username", required: true, secret: false },
      { name: "apiToken", label: "API token", required: true, secret: true },
      { name: "optional", label: "optional", required: false, secret: true },
    ]);
    await credentialConnectHost.save("sales", "fixture", "alice", { apiToken: "fixture-value", username: "alice-name" });
    expect(getPersonalExtensionTokens(store(), "sales", "alice", "fixture")).toEqual({ apiToken: "fixture-value", username: "alice-name" });
    expect(listSettingsChanges({ action: "extension.personal_update" }).entries).toEqual([
      expect.objectContaining({ actorUserId: "alice", agentId: "sales", targetId: "fixture", changes: expect.arrayContaining([{ field: "apiToken", secret: "set" }]) }),
    ]);
    await expect(credentialConnectHost.save("sales", "fixture", "alice", { apiToken: "" })).rejects.toThrow("Invalid personal credential fields");
    await expect(credentialConnectHost.save("sales", "unavailable", "alice", {})).rejects.toThrow("unavailable");
    await expect(credentialConnectHost.fields("missing", "fixture")).rejects.toThrow("unavailable");
  });
  it("lets an extension-owned OAuth connector join the same flow", async () => {
    const start = vi.fn(async (_options: CredentialOAuthConnectorOptions) => "https://extension.test/authorize");
    const unregister = registerCredentialOAuthConnector("fixture", start);
    const options = { agentId: "sales", userId: "alice", onComplete: vi.fn(async () => {}) };
    try {
      await expect(credentialConnectHost.start({ kind: "extension-oauth", extensionId: "fixture", targetId: "server-a" }, options)).resolves.toBe("https://extension.test/authorize");
      expect(start).toHaveBeenCalledWith(expect.objectContaining({ agentId: "sales", userId: "alice", targetId: "server-a" }));
      const complete = start.mock.calls[0][0].onComplete;
      await expect(complete("server-b")).rejects.toThrow("target ID does not match");
      expect(options.onComplete).not.toHaveBeenCalled();
      await complete("server-a");
      expect(options.onComplete).toHaveBeenCalledOnce();
      await expect(credentialConnectHost.start({ kind: "extension-oauth", extensionId: "fixture", targetId: " " }, options)).rejects.toThrow("target ID is required");
    } finally { unregister(); }
    await expect(credentialConnectHost.start({ kind: "extension-oauth", extensionId: "fixture", targetId: "server-a" }, options)).rejects.toThrow("does not support");
  });
  it("does not audit an unchanged personal token", async () => {
    const values = { apiToken: "unchanged", username: "alice-name" };
    await credentialConnectHost.save("sales", "fixture", "alice", values);
    const audited = listSettingsChanges({ action: "extension.personal_update" }).entries.length;
    await credentialConnectHost.save("sales", "fixture", "alice", values);
    expect(listSettingsChanges({ action: "extension.personal_update" }).entries).toHaveLength(audited);
  });
});
