import { API_BASE, apiFetch } from "./core";

export type ChatProject = { id: string; name: string; createdAt: number; updatedAt: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_BASE}/chat-projects${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Unable to update projects. Try again.");
  return response.json();
}

export const fetchChatProjects = () => request<{ items: ChatProject[] }>("");
export const fetchChatProject = (id: string) => request<ChatProject>(`/${encodeURIComponent(id)}`);
export const createChatProject = (name: string) => request<ChatProject>("", { method: "POST", body: JSON.stringify({ name }) });
export const renameChatProject = (id: string, name: string) => request<ChatProject>(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
export const deleteChatProject = (id: string) => request<unknown>(`/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function moveChatToProject(agentId: string, sessionId: string, projectId: string | null): Promise<void> {
  const response = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Unable to move chat. Try again.");
}
