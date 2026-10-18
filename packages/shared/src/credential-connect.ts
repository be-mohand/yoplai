import type { OAuthRequirement, ResolvedOAuth } from "./oauth/types.js";
import type { ExtensionAgentToolContext } from "./types.js";

export type CredentialConnectTarget =
  | { kind: "oauth"; provider: string; scopes?: string[] }
  | { kind: "token"; extensionId: string }
  | { kind: "extension-oauth"; extensionId: string; targetId: string };

export type CredentialConnectOptions = {
  agentId: string;
  userId: string;
  actorEmail?: string;
  impersonatorUserId?: string;
  /** Invoke only after persisting the verified personal credential. */
  onComplete: () => Promise<void>;
};

export type CredentialOAuthConnectorOptions = Omit<CredentialConnectOptions, "onComplete"> & {
  /** Opaque, extension-defined resource ID captured when the Slack link was issued. */
  targetId: string;
  /** Supply the same target ID after persisting that resource's personal grant. */
  onComplete: (targetId: string) => Promise<void>;
};

export interface CredentialConnectHost {
  registerOAuthConnector(extensionId: string, start: (options: CredentialOAuthConnectorOptions) => Promise<string>): () => void;
  requestLink(context: ExtensionAgentToolContext, target: CredentialConnectTarget): Promise<string | undefined>;
  start(target: CredentialConnectTarget, options: CredentialConnectOptions): Promise<string>;
  fields(agentId: string, extensionId: string): Promise<Array<{ name: string; label: string; required: boolean; secret?: boolean }>>;
  save(agentId: string, extensionId: string, userId: string, secrets: Record<string, string>): Promise<void>;
}

let linkProvider: ((context: ExtensionAgentToolContext, target: CredentialConnectTarget) => Promise<string | undefined>) | undefined;
export function registerCredentialConnectLinkProvider(provider: NonNullable<typeof linkProvider>): () => void {
  linkProvider = provider;
  return () => { if (linkProvider === provider) linkProvider = undefined; };
}
export async function requestCredentialConnectLink(context: ExtensionAgentToolContext, target: CredentialConnectTarget): Promise<string | undefined> {
  return linkProvider?.(context, target);
}

/** Refusal result for a tool call whose personal OAuth grant is missing; undefined when the call may proceed. */
export async function oauthConnectionRefusal(context: ExtensionAgentToolContext, requirement: OAuthRequirement, oauth: ResolvedOAuth): Promise<Record<string, unknown> | undefined> {
  if (oauth.connected || oauth.reason === "provider_not_configured") return undefined;
  const link = await requestCredentialConnectLink(context, { kind: "oauth", ...requirement });
  if (!link) return undefined;
  return { isError: true, error: "oauth_connection_required", ...(oauth.reason === "insufficient_scope" ? { connected: false, reason: oauth.reason } : {}), authorizeUrl: link, message: `Connect your personal ${oauth.provider} account at ${link}, then try again.` };
}

const connectors = new Map<string, (options: CredentialOAuthConnectorOptions) => Promise<string>>();
/** Extension-owned OAuth starts with a trusted personal owner and completion callback. */
export function registerCredentialOAuthConnector(extensionId: string, start: (options: CredentialOAuthConnectorOptions) => Promise<string>): () => void {
  connectors.set(extensionId, start);
  return () => { if (connectors.get(extensionId) === start) connectors.delete(extensionId); };
}
export async function startExtensionCredentialOAuth(extensionId: string, targetId: string, options: CredentialConnectOptions): Promise<string> {
  if (!targetId.trim()) throw new Error("An extension OAuth target ID is required.");
  const start = connectors.get(extensionId);
  if (!start) throw new Error("This extension does not support single-pass OAuth connection.");
  return start({
    ...options,
    targetId,
    onComplete: async (completedTargetId) => {
      if (completedTargetId !== targetId) throw new Error("Extension OAuth target ID does not match the connection request.");
      await options.onComplete();
    },
  });
}
