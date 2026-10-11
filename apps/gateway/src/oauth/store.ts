import fs from "node:fs";
import path from "node:path";
import {
  OAuthConnectionSchema,
  type CredentialScope,
  type OAuthConnection,
} from "@yoplai/shared";
import { CONFIG_DIR } from "../config/index.js";
import {
  deletePersonalShared,
  getPersonalShared,
  OAUTH_PERSONAL_SENTINEL,
  savePersonalShared,
  type PersonalFamily,
} from "../credentials/personal.js";
import { CredentialStore } from "../credentials/store.js";
import { TokenCipher } from "./crypto.js";
import { resolveTokenCipher } from "./encryption.js";

export function connectionScope(connection: OAuthConnection): CredentialScope {
  if (connection.scope === "personal") {
    if (!connection.userId) throw new Error("Personal credentials require a userId");
    return { type: "personal", userId: connection.userId };
  }
  return { type: "team" };
}

/** OAuth adapter over generic scoped credentials; legacy files remain team-only. */
export class OAuthConnectionStore {
  #dir: string;
  #cipher: TokenCipher | undefined;
  #credentials: CredentialStore;

  constructor(
    dir: string = path.join(CONFIG_DIR, "oauth"),
    cipher: TokenCipher | null | undefined = undefined
  ) {
    this.#dir = dir;
    this.#cipher = cipher === undefined ? resolveTokenCipher() : cipher ?? undefined;
    this.#credentials = new CredentialStore(dir, this.#cipher ?? null);
  }

  #legacyFile(agentId: string, provider: string): string {
    const safe = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.#dir, `${safe(agentId)}__${safe(provider)}.json`);
  }

  #getLegacy(agentId: string, provider: string): OAuthConnection | undefined {
    let raw: string;
    try {
      raw = fs.readFileSync(this.#legacyFile(agentId, provider), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const parsed = OAuthConnectionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;
    const connection = parsed.data;
    // Check exact row identity: legacy sanitized names can collide.
    if (connection.agentId !== agentId || connection.provider !== provider ||
        connection.scope === "personal") return undefined;
    return {
      ...connection,
      scope: "team",
      accessToken: this.#cipher?.decrypt(connection.accessToken) ?? connection.accessToken,
      refreshToken: connection.refreshToken === undefined ? undefined :
        this.#cipher?.decrypt(connection.refreshToken) ?? connection.refreshToken,
    };
  }

  /** Validate a stored row against the requested identity. */
  #parse(
    payload: unknown,
    agentId: string,
    provider: string,
    scope: CredentialScope
  ): OAuthConnection | undefined {
    const parsed = OAuthConnectionSchema.safeParse(payload);
    if (!parsed.success) return undefined;
    const connection = parsed.data;
    const storedScope = connectionScope(connection);
    if (connection.provider !== provider || storedScope.type !== scope.type ||
        (scope.type === "personal" && connection.userId !== scope.userId) ||
        (scope.type === "team" && connection.agentId !== agentId)) return undefined;
    return connection;
  }

  #personal(provider: string, userId: string): PersonalFamily {
    return { sentinel: OAUTH_PERSONAL_SENTINEL, integration: provider, userId };
  }

  get(
    agentId: string,
    provider: string,
    scope: CredentialScope = { type: "team" }
  ): OAuthConnection | undefined {
    if (scope.type === "team") {
      const payload = this.#credentials.get<unknown>({ agentId, integration: provider, scope });
      const shared = payload === undefined ? undefined : this.#parse(payload, agentId, provider, scope);
      return shared ?? this.#getLegacy(agentId, provider);
    }
    return getPersonalShared(
      this.#credentials,
      this.#personal(provider, scope.userId),
      agentId,
      (payload) => this.#parse(payload, agentId, provider, scope),
      (legacy) => legacy.agentId === agentId
    );
  }

  save(connection: OAuthConnection): OAuthConnection {
    const validated = OAuthConnectionSchema.parse(connection);
    const scope = connectionScope(validated);
    const normalized = { ...validated, scope: scope.type };
    if (scope.type === "personal") {
      savePersonalShared(this.#credentials, this.#personal(validated.provider, scope.userId), normalized);
    } else {
      this.#credentials.save({ agentId: validated.agentId, integration: validated.provider, scope }, normalized);
    }
    if (scope.type === "team" && this.#getLegacy(validated.agentId, validated.provider)) {
      fs.unlinkSync(this.#legacyFile(validated.agentId, validated.provider));
    }
    return normalized;
  }

  update(
    agentId: string,
    provider: string,
    patch: Partial<OAuthConnection>,
    scope: CredentialScope = { type: "team" }
  ): OAuthConnection | undefined {
    const existing = this.get(agentId, provider, scope);
    if (!existing) return undefined;
    return this.save({
      ...existing,
      ...patch,
      agentId: scope.type === "personal" ? existing.agentId : agentId,
      provider,
      scope: scope.type,
      userId: scope.type === "personal" ? scope.userId : undefined,
      updatedAt: Date.now(),
    });
  }

  delete(agentId: string, provider: string, scope: CredentialScope = { type: "team" }): void {
    if (scope.type === "personal") {
      deletePersonalShared(this.#credentials, this.#personal(provider, scope.userId), agentId);
      return;
    }
    this.#credentials.delete({ agentId, integration: provider, scope });
    if (scope.type === "team" && this.#getLegacy(agentId, provider)) {
      fs.unlinkSync(this.#legacyFile(agentId, provider));
    }
  }
}

let defaultStore: OAuthConnectionStore | undefined;

export function getOAuthConnectionStore(): OAuthConnectionStore {
  defaultStore ??= new OAuthConnectionStore();
  return defaultStore;
}
