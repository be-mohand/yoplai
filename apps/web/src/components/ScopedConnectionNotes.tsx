import type { CredentialScope } from "./CredentialScopeTabs";

/** Shared copy for the connection panels (OAuthConnectCard, McpServerDetails). Styles: OAUTH_CONNECT_CARD_STYLES. */
export const TEAM_MANAGED_NOTE = "The whole team connection is managed by an admin.";

export function ReconnectWarning() {
  return (
    <div class="oauth-connected-detail">
      <p class="oauth-warn-text">This connection can no longer refresh. Reconnect to restore access.</p>
    </div>
  );
}

export function ScopeUsageNote(props: { scope: CredentialScope }) {
  return (
    <p class="oauth-shared-note">
      {props.scope === "personal"
        ? "Used only for your requests. Without it, your requests use the team connection when available."
        : "Used by everyone on this agent who has no personal connection."}
    </p>
  );
}
