const basePath = import.meta.env.BASE_URL?.replace(/\/+$/, "") ?? "";

export function stripBase(pathname: string): string {
  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}

/** Agent and session ids addressed by a `/chat/:agentId?session=…` URL. */
export function chatRouteSession(pathname: string, search: string): { agentId?: string; sessionId?: string } {
  const match = stripBase(pathname).match(/^\/chat\/([^/?]+)/);
  const params = new URLSearchParams(search);
  return {
    agentId: match ? decodeURIComponent(match[1]) : undefined,
    sessionId: params.get("session") ?? undefined,
  };
}
