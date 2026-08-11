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
  if (!containsHtml(withBold)) return withBold.replace(/\n/g, "<br/>");
  // Mixed content: an HTML fragment (rich-text output, signature block) that
  // still carries plain `\n` line breaks — e.g. a plain-text template joined
  // onto an HTML signature. Those newlines would collapse into one run-on
  // paragraph, so convert them too. Newlines that merely sit *between* tags
  // are pretty-printing, not content, and are left alone.
  return withBold.replace(/\n/g, (_m, offset: number, str: string) => {
    const before = str.slice(0, offset).replace(/[ \t]+$/, "");
    const after = str.slice(offset + 1).replace(/^[ \t]+/, "");
    if (!before || !after) return "";
    if (before.endsWith(">") && after.startsWith("<")) return "";
    return "<br/>";
  });
}

/** True when the body is HTML that must be sent as `text/html`. */
export function looksLikeHtmlBody(body: string): boolean {
  return containsHtml(body ?? "");
}
