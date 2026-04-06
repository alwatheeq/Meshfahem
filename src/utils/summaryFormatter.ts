export type SummaryBlock =
  | { type: 'heading'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'text'; text: string };

/**
 * Parses raw AI-generated summary text into structured blocks.
 *
 * Rules:
 * - Lines matching /^=== .+ ===$/  → heading block
 * - Consecutive lines starting with "- " or "• " → grouped bullets block (prefix stripped)
 * - Empty lines flush the pending bullet buffer
 * - Everything else → text block
 */
export function parseBlocks(raw: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length > 0) {
      blocks.push({ type: 'bullets', items: [...bulletBuffer] });
      bulletBuffer = [];
    }
  };

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushBullets();
      continue;
    }

    if (/^=== .+ ===$/.test(trimmed)) {
      flushBullets();
      blocks.push({ type: 'heading', text: trimmed.replace(/^=== | ===$/g, '') });
      continue;
    }

    if (/^[-•]\s/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^[-•]\s+/, ''));
      continue;
    }

    flushBullets();
    blocks.push({ type: 'text', text: trimmed });
  }

  flushBullets();
  return blocks;
}
