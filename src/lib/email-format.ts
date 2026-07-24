// Helpers for coercing template/user-authored bodies into safe HTML for Gmail.
//
// Older templates were authored as plain text with `**bold**` markdown and
// naked `\n` line breaks. When sent as HTML those render as one run-on
// paragraph with literal asterisks. `toEmailHtml` normalizes any of the
// three flavours (plain, markdown-ish, real HTML) into HTML that Gmail
// renders with proper line breaks and bold runs.

const HTML_TAG_RE = /<(br|p|div|strong|b|em|i|a|ul|ol|li|span|h[1-6])\b/i;

export function containsHtml(s: string): boolean {
  return HTML_TAG_RE.test(s);
}

/** Convert literal `**text**` markdown into `<strong>text</strong>`. */
export function markdownBoldToHtml(s: string): string {
  return s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Normalize an email body to HTML suitable for sending with `isHtml: true`.
 * - Converts `**bold**` markdown to `<strong>` (safety net for old templates).
 * - If the input has no HTML tags, treats it as plain text and converts
 *   `\n` to `<br/>` so newlines actually render.
 * - If the input already contains HTML tags, assumes it is authored HTML
 *   and leaves whitespace alone.
 */
export function toEmailHtml(body: string): string {
  const withBold = markdownBoldToHtml(body ?? "");
  if (containsHtml(withBold)) return withBold;
  return withBold.replace(/\n/g, "<br/>");
}
