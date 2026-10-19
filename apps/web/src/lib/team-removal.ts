/** Confirmation text before an agent leaves one or more teams. `from` is "this team" or team names. */
export function teamRemovalWarning(agent: string, from: string, noTeamLeft: boolean, isPublic: boolean): string {
  const start = `If you remove ${agent} from ${from},`;
  if (isPublic) {
    return noTeamLeft
      ? `${start} ${agent} has no team. ${agent} stays Public, so you or any admin can add ${agent} to a team again.`
      : `${start} ${agent} stays Public, so members of ${from} can still chat with ${agent}.`;
  }
  return noTeamLeft
    ? `${start} ${agent} has no team. Only a superadmin can assign ${agent} to a team again.`
    : `${start} members of ${from} can no longer chat with ${agent}.`;
}
