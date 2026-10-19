import type { ExtensionAgentToolContext } from "@yoplai/shared";
import type { DashboardActor } from "./policy.js";

export async function resolveDashboardActor(
  context: ExtensionAgentToolContext,
  agentId: string
): Promise<DashboardActor> {
  if (context.actorKind === "eval") {
    return {
      userId: context.actorUserId,
      eligible: Boolean(context.actorUserId),
      hasAgentAccess: true,
    };
  }
  if (!context.config.extensions?.multiUser?.enabled) {
    return { userId: "local", eligible: true, hasAgentAccess: true };
  }
  const userId = context.actorUserId;
  if (!userId) return { eligible: true, hasAgentAccess: true };
  const { getMultiUserRuntime, getEligibleAccount, hasAgentAccess } =
    await import("@yoplai/extension-multi-user");
  const runtime = getMultiUserRuntime();
  const account =
    runtime &&
    getEligibleAccount(runtime.db, userId, { approvalBypass: "superadmin" });
  if (!account) return { userId, eligible: false, hasAgentAccess: false };
  const execution = await hasAgentAccess(
    {
      user: {
        id: userId,
        email: account.email,
        role: account.role,
        approved: true,
      },
      session: { id: "dashboard-actor", userId },
    },
    agentId
  );
  return {
    userId,
    eligible: true,
    superadmin: account.role === "superadmin",
    hasAgentAccess: execution,
  };
}
