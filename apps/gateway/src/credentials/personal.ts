import type { CredentialKey, CredentialStore } from "./store.js";

/**
 * Personal credentials follow the user across agents, so they live under one
 * credential-store agentId per family. Sentinels start with NUL, which no agent
 * folder name can contain. The key is hashed, so the sentinel is part of the
 * on-disk identity and must never change.
 */
export const OAUTH_PERSONAL_SENTINEL = "\0personal-shared";
export const EXTENSION_PERSONAL_SENTINEL = "\0personal-extension-shared";

/**
 * Written at the shared key on disconnect so stale legacy per-agent rows are not
 * re-promoted. Carries both historical flags (`tombstone` from OAuth, `__tombstone`
 * from extension tokens) so either generation of code recognises it.
 */
interface Tombstone {
  tombstone: true;
  __tombstone: true;
  integration: string;
  userId: string;
  deletedAt: number;
}

function isTombstone(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const flags = payload as { tombstone?: unknown; __tombstone?: unknown };
  return flags.tombstone === true || flags.__tombstone === true;
}

export interface PersonalFamily {
  sentinel: string;
  integration: string;
  userId: string;
}

function sharedKey({ sentinel, integration, userId }: PersonalFamily): CredentialKey {
  return { agentId: sentinel, integration, scope: { type: "personal", userId } };
}

function legacyKey(family: PersonalFamily, agentId: string): CredentialKey {
  return { agentId, integration: family.integration, scope: { type: "personal", userId: family.userId } };
}

/**
 * Read the user's shared personal value (decoding it once). A tombstone hides
 * everything. On a shared miss, the legacy per-agent row is promoted (saved, then deleted).
 * `parse` validates a raw payload, returning undefined to reject it; `acceptLegacy`
 * further restricts which legacy rows may be promoted.
 */
export function getPersonalShared<T>(
  store: CredentialStore,
  family: PersonalFamily,
  legacyAgentId: string,
  parse: (payload: unknown) => T | undefined,
  acceptLegacy: (value: T) => boolean = () => true
): T | undefined {
  const stored = store.get<unknown>(sharedKey(family));
  if (isTombstone(stored)) return undefined;
  const shared = stored === undefined ? undefined : parse(stored);
  if (shared !== undefined) return shared;
  const key = legacyKey(family, legacyAgentId);
  const rawLegacy = store.get<unknown>(key);
  const legacy = rawLegacy === undefined ? undefined : parse(rawLegacy);
  if (legacy === undefined || !acceptLegacy(legacy)) return undefined;
  store.save(sharedKey(family), legacy);
  store.delete(key);
  return legacy;
}

/** Persist the shared personal value, overwriting any tombstone. */
export function savePersonalShared(store: CredentialStore, family: PersonalFamily, value: unknown): void {
  store.save(sharedKey(family), value);
}

/** Remove the shared value and this agent's legacy row; later reads do not resurrect other legacy rows. */
export function deletePersonalShared(store: CredentialStore, family: PersonalFamily, legacyAgentId: string): void {
  const tombstone: Tombstone = {
    tombstone: true,
    __tombstone: true,
    integration: family.integration,
    userId: family.userId,
    deletedAt: Date.now(),
  };
  store.save(sharedKey(family), tombstone);
  store.delete(legacyKey(family, legacyAgentId));
}
