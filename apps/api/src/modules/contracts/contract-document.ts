/**
 * Turns a rendered contract body into the blocks the Word file lays out
 * (`contract-body.template.ts` documents the markers). The PDF renderer and
 * the on-screen document in `apps/web/app/utils/contract-document.ts` walk the
 * same block list, so a contract reads identically on paper and in the portal.
 */
export type ContractBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'parties'; columns: [string[], string[]] };

const HEADING = /^##\s+(.*)$/;
const PARTIES_OPEN = '[[parties]]';
const PARTIES_SPLIT = '[[|]]';
const PARTIES_CLOSE = '[[/parties]]';

export function parseContractBody(body: string): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');

  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === PARTIES_OPEN) {
      flush();
      const left: string[] = [];
      const right: string[] = [];
      let side = left;
      for (i += 1; i < lines.length && lines[i]!.trim() !== PARTIES_CLOSE; i += 1) {
        if (lines[i]!.trim() === PARTIES_SPLIT) side = right;
        else side.push(lines[i]!.trimEnd());
      }
      blocks.push({ kind: 'parties', columns: [trimEdges(left), trimEdges(right)] });
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', text: heading[1]!.trim() });
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
  while (start < end && !lines[start]!.trim()) start += 1;
  while (end > start && !lines[end - 1]!.trim()) end -= 1;
  return lines.slice(start, end);
}
