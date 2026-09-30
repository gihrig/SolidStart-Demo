/**
 * The character count the back-end's write-path hygiene enforces a length cap
 * on (`hygiene_value`, ADR-0019): NFC-normalize, fold CRLF and a lone CR to LF,
 * trim, then count Unicode scalar values. A front-end cap check built on this
 * agrees with the back-end's `max_len` exactly, where an input's `maxLength`
 * (UTF-16 code units) counts most emoji as two (#185 review). The back-end
 * stays the authoritative check.
 */
export function hygieneLength(value: string): number {
  const cleaned = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  return Array.from(cleaned).length;
}
