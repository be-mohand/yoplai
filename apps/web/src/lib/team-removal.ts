/** Confirmation text before an agent leaves one or more teams. `from` is "this team" or team names. */
export function teamRemovalWarning(agent: string, from: string, noTeamLeft: boolean): string {
  return noTeamLeft
    ? `If you remove ${agent} from ${from}, ${agent} has no team. Only a superadmin can assign ${agent} to a team again.`
    : `If you remove ${agent} from ${from}, members of ${from} can no longer chat with ${agent}, unless ${agent} is Public.`;
}
