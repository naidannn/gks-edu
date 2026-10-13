import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { expandSearchQuery } from './search-vocabulary.js';

/** How long loaded names answer searches before a reload is started behind them. */
const INDEX_TTL_MS = 10 * 60_000;

/** Recent queries' answers. A handful of words — "IT", "бизнес", "сувилахуй" — are most searches. */
const MAX_CACHED_QUERIES = 200;

interface Entry {
  id: string;
  /** The programme's and its college's names, as published. */
  text: string;
  /** The same, lower-cased once here rather than on every search. */
  lower: string;
}

/**
 * Every programme's names held in memory, so a search widened to its field is
 * answered in milliseconds (1I-15).
 *
 * Not SQL, and that was measured rather than assumed. "IT" widens to 36
 * fragments, each tried against six name columns; on the 13,791-programme
 * catalogue the ILIKE version took 500–700 ms however it was shaped — one
 * join or a subquery, a regex per column, a lower-cased generated column —
 * because nothing narrows an OR of substrings and Postgres reads every row.
 * The same match over the names here is ~15 ms, and nothing for a repeated
 * query. The database then gets `id IN (…)`, which its primary key answers.
 *
 * Staleness is bounded twice: every catalogue write in this process calls
 * `invalidate()` and the next search waits for fresh names; anything written
 * from elsewhere — an import script, a second API instance — is picked up
 * within `INDEX_TTL_MS`, while the old names keep answering.
 */
@Injectable()
export class ProgramSearchIndex {
  private readonly logger = new Logger(ProgramSearchIndex.name);
  private entries: Entry[] = [];
  private loadedAt = 0;
  /** Bumped by every write, so a load that began before it does not count as fresh. */
  private generation = 0;
  private dirty = true;
  private loading: Promise<void> | null = null;
  private readonly answers = new Map<string, string[]>();

  constructor(private readonly prisma: PrismaService) {}

  /** Ids of every programme whose own or college's names match the query, in any of the three languages. */
  async matchingIds(query: string): Promise<string[]> {
    await this.ensureFresh();

    const key = query.trim().replace(/\s+/g, ' ').toLowerCase();
    const cached = this.answers.get(key);
    if (cached) {
      // Re-inserted so the map's order is least-recently-used first.
      this.answers.delete(key);
      this.answers.set(key, cached);
      return cached;
    }

    const terms = expandSearchQuery(query).map((term) =>
      term.caseSensitive ? term : { ...term, text: term.text.toLowerCase() },
    );
    const ids = this.entries
      .filter((entry) => terms.some((term) => (term.caseSensitive ? entry.text : entry.lower).includes(term.text)))
      .map((entry) => entry.id);

    this.answers.set(key, ids);
    if (this.answers.size > MAX_CACHED_QUERIES) {
      this.answers.delete(this.answers.keys().next().value as string);
    }
    return ids;
  }

  /** A programme or a college was written: the next search reads the names again. */
  invalidate(): void {
    this.generation += 1;
    this.dirty = true;
  }

  private async ensureFresh(): Promise<void> {
    const expired = Date.now() - this.loadedAt >= INDEX_TTL_MS;
    if (!this.dirty && !expired) return;

    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });

    // After a write the editor's next search must show what they just saved,
    // so it waits. Mere age does not make an answer wrong: the old names keep
    // answering and the reload lands behind them.
    if (this.dirty) {
      await this.loading;
    } else {
      this.loading.catch(() => undefined);
    }
  }

  private async load(): Promise<void> {
    const generation = this.generation;
    try {
      const rows = await this.prisma.universityProgram.findMany({
        select: {
          id: true,
          nameMn: true,
          nameEn: true,
          nameKo: true,
          faculty: { select: { nameMn: true, nameEn: true, nameKo: true } },
        },
      });

      this.entries = rows.map((row) => {
        const text = [row.nameMn, row.nameEn, row.nameKo, row.faculty?.nameMn, row.faculty?.nameEn, row.faculty?.nameKo]
          .filter(Boolean)
          .join('\n');
        return { id: row.id, text, lower: text.toLowerCase() };
      });
      this.answers.clear();
      this.loadedAt = Date.now();
      // A write that landed while this load was reading leaves it dirty.
      this.dirty = generation !== this.generation;
    } catch (error) {
      // With names already loaded, a failed reload keeps them — a slightly
      // old answer beats a search that 500s. With none, the search fails.
      this.logger.warn(`Хөтөлбөрийн хайлтын индекс ачаалж чадсангүй: ${(error as Error).message}`);
      if (this.entries.length === 0) throw error;
      this.loadedAt = Date.now();
    }
  }
}
