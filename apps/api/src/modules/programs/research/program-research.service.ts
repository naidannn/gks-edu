import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PROGRAM_RESEARCH_JOB, PROGRAM_RESEARCH_QUEUE } from '../../../queue/queue.constants.js';
import { IntakeResearchStatus, Prisma, type ProgramLevel } from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AdmissionConfigService } from '../../admissions/admission-config.service.js';
import { DeepseekService } from '../../admissions/research/deepseek.service.js';
import { GeminiService, extractJson } from '../../admissions/research/gemini.service.js';
import {
  ProgramResearchParseError,
  parseProgramResearchResult,
  type ProgramCandidate,
} from './program-candidate.parser.js';
import { buildProgramResearchPrompt } from './program-research.prompt.js';
import { mockProgramResearchAnswer } from './program-research.mock.js';

const RUN_SELECT = {
  id: true,
  universityId: true,
  levels: true,
  year: true,
  status: true,
  model: true,
  candidates: true,
  sources: true,
  error: true,
  acceptedCount: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  university: { select: { nameMn: true, nameEn: true } },
  requestedBy: { select: { id: true, name: true } },
} satisfies Prisma.ProgramResearchRunSelect;

/**
 * "Look this school's programmes and tuition up online."
 *
 * The rule is the one `IntakeResearchService` established and this feature
 * inherits without exception: **a run never writes a `UniversityProgram`.** It
 * produces candidates, staff read them next to their source links, tick the
 * ones they believe, and save. A model filling the price list the office quotes
 * from is precisely the failure this is meant to prevent, not cause.
 */
@Injectable()
export class ProgramResearchService {
  private readonly logger = new Logger(ProgramResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly deepseek: DeepseekService,
    private readonly config: AdmissionConfigService,
    @InjectQueue(PROGRAM_RESEARCH_QUEUE) private readonly queue: Queue,
  ) {}

  /** Queues a run and hands back the row to poll. */
  async start(
    params: { universityId: string; year: number; levels?: ProgramLevel[] },
    requestedById: string | null,
  ) {
    const university = await this.prisma.university.findUnique({
      where: { id: params.universityId },
      select: { id: true },
    });
    if (!university) throw new NotFoundException('Сургууль олдсонгүй.');

    const model = (await this.config.get()).programResearchModel;

    const run = await this.prisma.programResearchRun.create({
      data: {
        universityId: params.universityId,
        year: params.year,
        levels: params.levels ?? [],
        model,
        requestedById,
      },
      select: RUN_SELECT,
    });

    await this.queue.add(
      PROGRAM_RESEARCH_JOB,
      { runId: run.id },
      // `jobId` = the run id, so a double-click cannot queue the search twice.
      { jobId: run.id, attempts: 1, removeOnComplete: true, removeOnFail: 100 },
    );

    return this.serialize(run);
  }

  async findOne(id: string) {
    const run = await this.prisma.programResearchRun.findUnique({ where: { id }, select: RUN_SELECT });
    if (!run) throw new NotFoundException('Судалгааны ажиллагаа олдсонгүй.');
    return this.serialize(run);
  }

  /** Recent runs, so staff can reopen a search rather than pay for it again. */
  async findRecent(universityId?: string, limit = 20) {
    const runs = await this.prisma.programResearchRun.findMany({
      where: universityId ? { universityId } : {},
      select: RUN_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return runs.map((run) => this.serialize(run));
  }

  /**
   * The worker body. Never throws: a failed search is a `FAILED` row with a
   * Mongolian reason on it, which is what the admin screen needs to show.
   */
  async execute(runId: string): Promise<void> {
    const run = await this.prisma.programResearchRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        year: true,
        levels: true,
        model: true,
        university: {
          select: { nameMn: true, nameEn: true, nameKo: true, cityEn: true, links: true },
        },
      },
    });
    if (!run) return;

    await this.prisma.programResearchRun.update({
      where: { id: runId },
      data: { status: IntakeResearchStatus.RUNNING, startedAt: new Date() },
    });

    // Kept outside the try so a failed parse still lands in `rawResponse`,
    // which is the only way to see what the model actually wrote.
    let rawResponse: string | null = null;

    try {
      const links = (run.university.links ?? {}) as { officialWebsite?: string | null };

      const prompt = buildProgramResearchPrompt({
        nameMn: run.university.nameMn,
        nameEn: run.university.nameEn,
        nameKo: run.university.nameKo,
        cityEn: run.university.cityEn,
        officialWebsite: links.officialWebsite ?? null,
        year: run.year,
        levels: run.levels,
        // Which question is honest to ask depends on who is answering.
        grounded: !run.model.startsWith('deepseek'),
      });

      const answer = await this.provider(run.model).generateJson({
        model: run.model,
        prompt,
        mockAnswer: () => mockProgramResearchAnswer(run.year, run.levels),
      });
      rawResponse = answer.text.slice(0, 40_000);

      // `answer.sources` is Google's grounding trail, the one part of the reply
      // the model does not author. Empty means the search tool never ran and
      // the prices were written from memory — which the lite models will
      // happily do, and label HIGH. A mock run has no trail by construction and
      // says so in its own notes, so it is exempt rather than marked down.
      // DeepSeek has no grounding at all, so `sources` is empty by
      // construction and every candidate lands at LOW with the "from memory"
      // note. That is the truthful label for a recall answer, and it is the
      // same label Gemini earns on this prompt in practice.
      const grounded = this.provider(run.model).isMock || answer.sources.length > 0;
      if (!grounded) {
        this.logger.warn(
          `Grounding хоосон (${runId}): загвар хайлт хийлгүй хариулсан тул бүх саналыг LOW болголоо`,
        );
      }

      // Two guards, in order: the reply must be JSON, and the JSON must be the
      // shape we asked for. Anything else is a failed run, not a half-filled
      // review list for somebody to untangle.
      const parsed = parseProgramResearchResult(extractJson(answer.text), { grounded });
      const candidates = this.dedupe(parsed.candidates);
      const sources = [...new Set([...answer.sources, ...parsed.sources])];

      await this.prisma.programResearchRun.update({
        where: { id: runId },
        data: {
          status: IntakeResearchStatus.SUCCEEDED,
          candidates: candidates as unknown as Prisma.InputJsonValue,
          sources,
          rawResponse,
          promptTokens: answer.promptTokens,
          responseTokens: answer.responseTokens,
          finishedAt: new Date(),
        },
      });

      this.logger.log(
        `Хөтөлбөрийн судалгаа дууслаа: ${run.university.nameMn} ${run.year} — ${candidates.length} санал`,
      );
    } catch (error) {
      const message =
        error instanceof ProgramResearchParseError
          ? `Хариу буруу бүтэцтэй байна: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      await this.prisma.programResearchRun.update({
        where: { id: runId },
        data: {
          status: IntakeResearchStatus.FAILED,
          error: message.slice(0, 1000),
          rawResponse,
          finishedAt: new Date(),
        },
      });
      this.logger.error(`Хөтөлбөрийн судалгаа амжилтгүй боллоо (${runId}): ${message}`);
    }
  }

  /**
   * Which provider answers, decided by the model name alone.
   *
   * `AdmissionConfig.programResearchModel` is a free-text field an admin types,
   * so the prefix is the routing: anything `deepseek-` goes to DeepSeek, the
   * rest to Gemini. One field, no second switch to keep in step with it.
   */
  private provider(model: string): GeminiService | DeepseekService {
    return model.startsWith('deepseek') ? this.deepseek : this.gemini;
  }

  /**
   * Collapses duplicate departments, keeping the best-evidenced one. A model
   * asked to search reports the same department twice from two pages often
   * enough that the review list is unreadable without this.
   */
  private dedupe(candidates: ProgramCandidate[]): ProgramCandidate[] {
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    const best = new Map<string, ProgramCandidate>();

    for (const candidate of candidates) {
      const name = (candidate.nameKo ?? candidate.nameEn ?? '').trim().toLowerCase();
      const key = `${candidate.level}:${name}`;
      const current = best.get(key);
      if (!current || rank[candidate.confidence] > rank[current.confidence]) best.set(key, candidate);
    }

    return [...best.values()].sort(
      (a, b) =>
        a.level.localeCompare(b.level) || (a.nameKo ?? a.nameEn ?? '').localeCompare(b.nameKo ?? b.nameEn ?? ''),
    );
  }

  private serialize(run: Prisma.ProgramResearchRunGetPayload<{ select: typeof RUN_SELECT }>) {
    const { university, candidates, ...rest } = run;
    return {
      ...rest,
      universityNameMn: university.nameMn,
      universityNameEn: university.nameEn,
      candidates: (candidates as ProgramCandidate[] | null) ?? null,
      // No key configured means every run is the same thirteen fixtures. It is
      // said on each candidate's note too, but a reviewer scanning a list of
      // thirteen plausible departments reads the list, not the notes — and then
      // wonders why the school only teaches four subjects. This is the current
      // mode, not the mode the run executed in; for a run you are looking at
      // now those are the same thing, and "what am I about to trust" is the
      // question being answered.
      mock: this.provider(run.model).isMock,
    };
  }
}
