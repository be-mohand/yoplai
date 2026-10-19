import type { MembershipStore } from "./membership.js";
import type { ForkStore } from "./forks.js";

/** Public forks are usable company-wide; Private forks require shared team membership. */
export type AccessResolver = {
  /**
   * True iff the fork is Public or `userId` shares a team with it. Returns
   * false for an inaccessible Private fork or an agent
   * id that is not a known fork. Does NOT apply staff bypass — callers layer
   * that on top.
   */
  canUserChatAgent(userId: string, forkAgentId: string): boolean;
  /**
   * The union of fork agent ids chattable across all of `userId`'s teams. For
   * a teamless user this contains exactly Public forks. Does NOT apply staff bypass.
   */
  getVisibleChatAgents(userId: string): string[];
};

export type AccessResolverDeps = {
  membership: MembershipStore;
  forks: ForkStore;
};

export function createAccessResolver(deps: AccessResolverDeps): AccessResolver {
  const { membership, forks } = deps;

  function canUserChatAgent(userId: string, forkAgentId: string): boolean {
    const fork = forks.getForkByAgentId(forkAgentId);
    // Unknown agents have no chat grant.
    if (!fork) return false;
    if (fork.public) return true;
    const teamIds = fork.assignment.teamIds;
    return teamIds.some((teamId) => membership.isMember(teamId, userId));
  }

  function getVisibleChatAgents(userId: string): string[] {
    const teamIds = new Set(membership.listTeamsForUser(userId));
    // Each fork appears once even when several linked teams grant access.
    return forks
      .listForks()
      .filter((fork) => fork.public || fork.assignment.teamIds.some((teamId) => teamIds.has(teamId)))
      .map((fork) => fork.forkAgentId)
      .sort();
  }

  return { canUserChatAgent, getVisibleChatAgents };
}
