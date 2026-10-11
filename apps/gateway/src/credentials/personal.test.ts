import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OAuthConnection } from "@yoplai/shared";
import { TokenCipher } from "../oauth/crypto.js";
import { OAuthConnectionStore } from "../oauth/store.js";
import { CredentialStore } from "./store.js";
import { extensionTokenIntegration, getPersonalExtensionTokens, storePersonalExtensionTokens } from "./extension-tokens.js";

// Fixtures are written the way the pre-refactor code wrote them: the sentinel
// agentId is part of the hashed on-disk key, and each side used its own tombstone shape.
const OAUTH_SENTINEL = "\0personal-shared";
const TOKEN_SENTINEL = "\0personal-extension-shared";
const alice = { type: "personal", userId: "alice" } as const;

let dir: string;
let cipher: TokenCipher;
let credentials: CredentialStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-"));
  cipher = new TokenCipher("test-secret");
  credentials = new CredentialStore(dir, cipher);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const connection = (overrides: Partial<OAuthConnection> = {}): OAuthConnection => ({
  agentId: "sally", provider: "google", accessToken: "token", scopes: ["a"], connectedAt: 1, updatedAt: 1,
  scope: "personal", userId: "alice", ...overrides,
});

describe("personal credentials written by the previous code", () => {
  it("resolves an OAuth grant stored under the old shared sentinel", () => {
    credentials.save({ agentId: OAUTH_SENTINEL, integration: "google", scope: alice }, connection());
    expect(new OAuthConnectionStore(dir, cipher).get("cira", "google", alice)?.accessToken).toBe("token");
  });

  it("honours an old OAuth tombstone over legacy rows", () => {
    credentials.save({ agentId: OAUTH_SENTINEL, integration: "google", scope: alice }, { tombstone: true, provider: "google", userId: "alice", deletedAt: 1 });
    credentials.save({ agentId: "sally", integration: "google", scope: alice }, connection());
    expect(new OAuthConnectionStore(dir, cipher).get("sally", "google", alice)).toBeUndefined();
  });

  it("resolves extension tokens stored under the old shared sentinel", () => {
    credentials.save({ agentId: TOKEN_SENTINEL, integration: extensionTokenIntegration("zendesk"), scope: alice }, { apiKey: "k" });
    expect(getPersonalExtensionTokens(credentials, "cira", "alice", "zendesk")).toEqual({ apiKey: "k" });
  });

  it("honours an old extension-token tombstone over legacy rows, and a re-save clears it", () => {
    const integration = extensionTokenIntegration("zendesk");
    credentials.save({ agentId: TOKEN_SENTINEL, integration, scope: alice }, { __tombstone: true, deletedAt: 1 });
    credentials.save({ agentId: "sally", integration, scope: alice }, { apiKey: "legacy" });
    expect(getPersonalExtensionTokens(credentials, "sally", "alice", "zendesk")).toBeUndefined();
    storePersonalExtensionTokens(credentials, "alice", "zendesk", { apiKey: "new" });
    expect(getPersonalExtensionTokens(credentials, "sally", "alice", "zendesk")).toEqual({ apiKey: "new" });
  });

  it("keeps the two sentinels independent", () => {
    credentials.save({ agentId: OAUTH_SENTINEL, integration: extensionTokenIntegration("zendesk"), scope: alice }, { apiKey: "wrong" });
    expect(getPersonalExtensionTokens(credentials, "sally", "alice", "zendesk")).toBeUndefined();
  });
});
