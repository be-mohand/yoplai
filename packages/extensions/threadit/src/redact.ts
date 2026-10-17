/** Light masking of obvious secrets in activity text. Not exhaustive. */

export const MASK = "•••";

const NAME = `[\\w-]*(?:token|secret|password|passwd|api_key|apikey|api-key)[\\w-]*`;

const RULES: Array<[RegExp, string]> = [
  [/\b(authorization\s*:\s*)(?:(bearer|basic|token)\s+)?[^\s"'`]+/gi, `$1$2 ${MASK}`],
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${MASK}`],
  [new RegExp(`(["'])(${NAME})\\1(\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, "gi"), `$1$2$1$3"${MASK}"`],
  [new RegExp(`(--${NAME})(\\s+|=)[^\\s"']+`, "gi"), `$1$2${MASK}`],
  [new RegExp(`\\b(${NAME})=(?:'[^']*'|"[^"]*"|[^\\s]+)`, "gi"), `$1=${MASK}`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${MASK}@`],
  [/\b(?:ghp_|ghs_|github_pat_|sk-ant-|sk-|xox[a-z]-|lin_api_)[A-Za-z0-9_-]{6,}/g, MASK],
  [/\bAKIA[0-9A-Z]{12,}/g, MASK],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+/g, MASK],
];

export function redact(text: string): string {
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}
