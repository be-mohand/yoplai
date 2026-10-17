/** Mask secrets in activity text. Conservative: a false mask beats a leak. */

const MASK = "•••";
const KEY =
  "[A-Za-z0-9_.-]*(?:token|secret|passw(?:or)?d|passwd|api[_-]?key|key|auth|credential|cookie)[A-Za-z0-9_.-]*";
const VALUE = `("(?:[^"\\\\]|\\\\.)*"|'[^']*'|[^\\s&,;]+)`;

const RULES: Array<[RegExp, string]> = [
  // URL credentials: scheme://user:pass@host
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${MASK}@`],
  // Authorization headers and auth schemes
  [/\b((?:proxy-)?authorization)(\s*[:=]\s*)[^\n"']+/gi, `$1$2${MASK}`],
  [/\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{4,}/gi, `$1 ${MASK}`],
  // "secret_key": "value"
  [new RegExp(`("${KEY}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, "gi"), `$1"${MASK}"`],
  // --api-key value / --token=value
  [new RegExp(`(--?${KEY})(\\s+|=)${VALUE}`, "gi"), `$1$2${MASK}`],
  // API_KEY=value / password: value
  [new RegExp(`\\b(${KEY})(\\s*[=:]\\s*)${VALUE}`, "gi"), `$1$2${MASK}`],
  // Well-known token formats
  [/\b(?:gh[psoru]_|github_pat_|sk-ant-|sk-|xox[abprs]-|lin_api_)[A-Za-z0-9_-]{6,}/g, MASK],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{12,}/g, MASK],
  [/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/g, MASK],
  // Bare high-entropy runs (base64/hex) with at least one digit
  [/[A-Za-z0-9+_=-]*\d[A-Za-z0-9+_=-]*/g, ""],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) {
    if (replacement === "") {
      out = out.replace(pattern, (run) => (run.length >= 32 ? MASK : run));
    } else {
      out = out.replace(pattern, replacement);
    }
  }
  return out;
}
