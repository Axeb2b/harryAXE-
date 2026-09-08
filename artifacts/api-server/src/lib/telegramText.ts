// Deep Forwarding text helper: Telegram MarkdownV2 escaping, single definition.
export function escapeMarkdown(text: unknown): string {
  return String(text || "").replace(/[\[\]()_*`\]~#>=|.-]/g, "\\$&");
}

/** Escape text intended as a clickable link label. */
export function escapeLink(text: unknown): string {
  return String(text || "").replace(/[\[\]()]/g, "\\$&");
}
