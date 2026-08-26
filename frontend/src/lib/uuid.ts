// crypto.randomUUID() requires a secure context (HTTPS or localhost) and is
// undefined otherwise — including plain HTTP on a LAN IP, which is exactly
// how owners set up KHEL-O on-site before a domain/TLS cert is configured.
// Calling it unconditionally throws on the very first platform chip click
// during that flow. This wrapper falls back to a non-cryptographic but
// sufficiently-unique id for the purely-local purpose these ids serve
// (React list keys / local config identity) — never used as a security
// token.
export function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
