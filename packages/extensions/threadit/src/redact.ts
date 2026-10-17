/**
 * Mask secrets in activity text. A second layer: bash labels are first cut
 * by `bashLabel`. Conservative, and idempotent: masked values are left alone.
 */

export const MASK = "•••";

const SENSITIVE_SEGMENTS = new Set([
  "key",
  "keys",
  "auth",
  "authorization",
  "session",
  "sid",
  "sig",
  "signature",
  "pin",
  "otp",
  "bearer",
  "jwt",
  "pat",
]);

/** True when a key, flag or variable name suggests a credential. */
export function sensitiveName(name: string): boolean {
  const letters = name.toLowerCase().replace(/[^a-z]/g, "");
  if (/token|secret|passw|credential|cookie|apikey|privatekey/.test(letters)) {
    return true;
  }
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((s) => SENSITIVE_SEGMENTS.has(s) || /(pass|pwd)$/.test(s));
}

/** One shell-ish value: quoted parts, escapes and plain chars, concatenated. */
const VALUE = `(?:"(?:[^"\\\\]|\\\\.)*"|'[^']*'|\\\\.|[^\\s&,;"'])+`;

const maskIf =
  (nameAt: number, valueAt: number) =>
  (...m: string[]): string => {
    const value = m[valueAt] ?? "";
    if (!sensitiveName(m[nameAt] ?? "") || value.includes(MASK)) return m[0]!;
    return m[0]!.slice(0, m[0]!.length - value.length) + MASK;
  };

type Rule = [RegExp, string | ((...m: string[]) => string)];

const RULES: Rule[] = [
  // URL credentials and query strings
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@"'`]+@/gi, `$1${MASK}@`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'`]*)\?[^\s"'`#]+/gi, `$1?${MASK}`],
  // Credential headers: everything to the end of the header value
  [
    /\b((?:proxy-)?authorization|(?:set-)?cookie|x-api-key|x-auth-token)(\s*:\s*)(?!\s*•••)[^\n"'`]+/gi,
    `$1$2${MASK}`,
  ],
  [/\b(bearer|basic)\s+(?!\s*•••)[A-Za-z0-9._~+/=-]{4,}/gi, `$1 ${MASK}`],
  // "password": "x", \"token\":\"x\", "pin": 1234
  [
    /(\\?["'])([A-Za-z0-9_.-]+)\1(\s*:\s*)(\\?"(?:[^"\\]|\\(?!"))*\\?"|[^,}\s]+)/g,
    (...m: string[]) => {
      const [all, , name, , value] = m as [string, string, string, string, string];
      if (!sensitiveName(name) || value.includes(MASK)) return all;
      const quote = value.startsWith('\\"') ? '\\"' : value.startsWith('"') ? '"' : "";
      return all.slice(0, all.length - value.length) + quote + MASK + quote;
    },
  ],
  // Values after credential-carrying curl/ssh-style flags (-u user:pass, -H ...)
  [
    new RegExp(
      `((?:^|\\s)(?:-[uHdpbe]|--(?:user|header|data[\\w-]*|cookie|proxy-user|form)))(\\s+|=)(${VALUE})`,
      "g"
    ),
    (...m: string[]) => {
      const [all, , , value] = m as [string, string, string, string];
      // "…" is the cut marker of a bash label, not a value.
      return value.includes(MASK) || value === "…"
        ? all
        : all.slice(0, all.length - value.length) + MASK;
    },
  ],
  // --api-key value / --token=value
  [new RegExp(`(--?)([A-Za-z][\\w-]*)(\\s+|=)(${VALUE})`, "g"), maskIf(2, 4)],
  // API_KEY=value / password: value
  [new RegExp(`\\b([A-Za-z_][\\w.-]*)(\\s*[=:]\\s*)(${VALUE})`, "g"), maskIf(1, 3)],
  // Well-known token formats
  [/\b(?:gh[psoru]_|github_pat_|sk-ant-|sk-|xox[abprs]-|lin_api_)[A-Za-z0-9_-]{6,}/g, MASK],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{12,}/g, MASK],
  [/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/g, MASK],
  // Long runs of base64/hex chars with a digit (a length rule, not real entropy)
  [/[A-Za-z0-9+_=-]*\d[A-Za-z0-9+_=-]*/g, (run: string) => (run.length >= 32 ? MASK : run)],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) {
    out =
      typeof replacement === "string"
        ? out.replace(pattern, replacement)
        : out.replace(pattern, replacement as (...m: string[]) => string);
  }
  return out;
}

/** True when a single word looks like a token by itself. */
export function looksLikeToken(word: string): boolean {
  return redact(word) !== word;
}
