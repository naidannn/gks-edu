/**
 * The contract body, split into the blocks the signed Word file lays out.
 *
 * This mirrors `apps/api/src/modules/contracts/contract-document.ts`, which
 * documents the markers and drives the PDF — the two must stay in step so a
 * contract reads the same on screen as it does on paper.
 */
export type ContractBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'parties'; columns: [string[], string[]] };

const HEADING = /^##\s+(.*)$/;
const PARTIES_OPEN = '[[parties]]';
const PARTIES_SPLIT = '[[|]]';
const PARTIES_CLOSE = '[[/parties]]';

/** `1.1 `, `2.6 ` — the clause number, which the contract sets in bold. */
export const CLAUSE_NUMBER = /^(\d+(?:\.\d+)*\s)([\s\S]*)$/;

export function parseContractBody(body: string): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');

  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? '').trim();

    if (trimmed === PARTIES_OPEN) {
      flush();
      const left: string[] = [];
      const right: string[] = [];
      let side = left;
      for (i += 1; i < lines.length && (lines[i] ?? '').trim() !== PARTIES_CLOSE; i += 1) {
        if ((lines[i] ?? '').trim() === PARTIES_SPLIT) side = right;
        else side.push((lines[i] ?? '').trimEnd());
      }
      blocks.push({ kind: 'parties', columns: [trimEdges(left), trimEdges(right)] });
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', text: (heading[1] ?? '').trim() });
      continue;
    }

    if (!trimmed) flush();
    else paragraph.push(trimmed);
  }

  flush();
  return blocks;
}

/** Blank lines inside a party column are meaningful; leading/trailing ones are not. */
function trimEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !(lines[start] ?? '').trim()) start += 1;
  while (end > start && !(lines[end - 1] ?? '').trim()) end -= 1;
  return lines.slice(start, end);
}

/** `2026 оны 09-р сарын 02-ны өдөр`, the way the contract dates itself. */
export function formatContractDateMn(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()} оны ${month}-р сарын ${day}-ны өдөр`;
}
