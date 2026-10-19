export type MainAgentPreference = {
  mainAgentId: string | null;
  pickerDismissedAt: string | null;
  updatedAt: string;
};

export type MainAgentState = {
  mainAgentId: string | null;
  accessible: boolean;
  pickerDismissedAt: string | null;
};

/** Pool catalog cards resolve to runnable fork ids, never template ids. */
export function eligibleMainAgents<T extends { id: string }>(
  agents: T[],
  poolActions?: readonly { action: string; chatAgentId: string | null }[],
): T[] {
  if (poolActions === undefined) return agents;
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  return poolActions.flatMap((entry) => {
    if (entry.action !== "chat" || entry.chatAgentId === null) return [];
    const agent = agentsById.get(entry.chatAgentId);
    return agent ? [agent] : [];
  });
}
