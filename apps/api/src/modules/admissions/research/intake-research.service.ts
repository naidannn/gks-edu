import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { INTAKE_RESEARCH_JOB, INTAKE_RESEARCH_QUEUE } from '../../../queue/queue.constants.js';
import { IntakeResearchStatus, Prisma, type ProgramLevel } from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AdmissionConfigService } from '../admission-config.service.js';
import { DeepseekService } from './deepseek.service.js';
import { GeminiService, extractJson } from './gemini.service.js';
import {
  IntakeResearchParseError,
  parseResearchResult,
  type IntakeCandidate,
} from './intake-candidate.parser.js';
import { buildResearchPrompt } from './intake-research.prompt.js';
import { mockResearchAnswer } from './intake-research.mock.js';

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
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  university: { select: { nameMn: true, nameEn: true } },
  requestedBy: { select: { id: true, name: true } },
} satisfies Prisma.IntakeResearchRunSelect;

/**
 * "Look this school's intake calendar up online" (1H-10).
 *
 * The rule that shapes every method here: **a run never writes an
 * `IntakeTerm`.** It produces candidates, staff read them next to their source
 * links, drop the ones they believe into the form, and save. An LLM filling
 * the office's deadline calendar unattended is precisely the failure this
 * feature is meant to prevent, not cause.
 */
@Injectable()
export class IntakeResearchService {
  private readonly logger = new Logger(IntakeResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly deepseek: DeepseekService,
    private readonly config: AdmissionConfigService,
    @InjectQueue(INTAKE_RESEARCH_QUEUE) private readonly queue: Queue,
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

    const model = (await this.config.get()).researchModel;

    const run = await this.prisma.intakeResearchRun.create({
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
      INTAKE_RESEARCH_JOB,
      { runId: run.id },
      // `jobId` = the run id, so a double-click cannot queue the search twice.
      { jobId: run.id, attempts: 1, removeOnComplete: true, removeOnFail: 100 },
    );

    return this.serialize(run);
  }

  async findOne(id: string) {
    const run = await this.prisma.intakeResearchRun.findUnique({ where: { id }, select: RUN_SELECT });
    if (!run) throw new NotFoundException('Судалгааны ажиллагаа олдсонгүй.');
    return this.serialize(run);
  }

  /** Recent runs, so staff can reopen a search rather than pay for it again. */
  async findRecent(universityId?: string, limit = 20) {
    const runs = await this.prisma.intakeResearchRun.findMany({
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
    const run = await this.prisma.intakeResearchRun.findUnique({
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

    await this.prisma.intakeResearchRun.update({
      where: { id: runId },
      data: { status: IntakeResearchStatus.RUNNING, startedAt: new Date() },
    });

    // Kept outside the try so a failed parse still lands in `rawResponse`,
    // which is the only way to see what the model actually wrote.
    let rawResponse: string | null = null;

    try {
      const links = (run.university.links ?? {}) as { officialWebsite?: string | null };
      const provider = this.provider(run.model);
      const prompt = buildResearchPrompt(
        {
          nameMn: run.university.nameMn,
          nameEn: run.university.nameEn,
          nameKo: run.university.nameKo,
          cityEn: run.university.cityEn,
          officialWebsite: links.officialWebsite ?? null,
          year: run.year,
          levels: run.levels,
        },
        // Ordering a search the request carries no tool for returns an empty
        // list, by that prompt's own rule 0.
        { search: this.searches(run.model) },
      );

      const answer = await provider.generateJson({
        model: run.model,
        prompt,
        mockAnswer: () => mockResearchAnswer(run.year, run.levels),
      });
      rawResponse = answer.text.slice(0, 20_000);

      // `answer.sources` is Google's grounding trail, the one part of the reply
      // the model does not author. Empty means the search tool never ran and
      // the dates were written from memory — which the lite models will happily
      // do, and label HIGH. A mock run has no trail by construction and says so
      // in its own notes, so it is exempt rather than marked down.
      const grounded = provider.isMock || answer.sources.length > 0;
      if (!grounded && !this.searches(run.model)) {
        // Expected here, not a fault: search is off, so the run is a recall by
        // design and LOW is the honest label for all of it.
        this.logger.log(`Хайлтгүй горим (${runId}): бүх санал LOW, шалгуулахаар тэмдэглэв`);
      } else if (!grounded) {
        this.logger.warn(
          `Grounding хоосон (${runId}): загвар хайлт хийлгүй хариулсан тул бүх саналыг LOW болголоо`,
        );
      }

      // Two guards, in order: the reply must be JSON, and the JSON must be the
      // shape we asked for. Anything else is a failed run, not a half-filled
      // form for a reviewer to untangle.
      const parsed = parseResearchResult(extractJson(answer.text), run.year, { grounded });
      const candidates = this.dedupe(parsed.candidates);
      const sources = [...new Set([...answer.sources, ...parsed.sources])];

      await this.prisma.intakeResearchRun.update({
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

      this.logger.log(`Элсэлтийн судалгаа дууслаа: ${run.university.nameMn} ${run.year} — ${candidates.length} санал`);
    } catch (error) {
      const message =
        error instanceof IntakeResearchParseError
          ? `Хариу буруу бүтэцтэй байна: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      await this.prisma.intakeResearchRun.update({
        where: { id: runId },
        data: {
          status: IntakeResearchStatus.FAILED,
          error: message.slice(0, 1000),
          rawResponse,
          finishedAt: new Date(),
        },
      });
      this.logger.error(`Элсэлтийн судалгаа амжилтгүй боллоо (${runId}): ${message}`);
    }
  }

  /**
   * Which provider answers, decided by the model name alone — the same routing
   * `ProgramResearchService` uses, because `AdmissionConfig.researchModel` is
   * the same kind of field: free text an admin types. Anything `deepseek-`
   * goes to DeepSeek, the rest to Gemini.
   */
  private provider(model: string): GeminiService | DeepseekService {
    return model.startsWith('deepseek') ? this.deepseek : this.gemini;
  }

  /**
   * Whether this run can search at all. DeepSeek has no grounding of any kind,
   * so a search order in its prompt is an instruction it cannot follow — and
   * rule 0 of that prompt then empties the list.
   */
  private searches(model: string): boolean {
    return !model.startsWith('deepseek') && this.gemini.isSearchEnabled;
  }

  /**
   * Collapses duplicate rounds, keeping the best-evidenced one. Models asked
   * to search sometimes report the same round twice from two pages.
   */
  private dedupe(candidates: IntakeCandidate[]): IntakeCandidate[] {
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    const best = new Map<string, IntakeCandidate>();

    for (const candidate of candidates) {
      const key = `${candidate.level}:${candidate.year}:${candidate.month}`;
      const current = best.get(key);
      if (!current || rank[candidate.confidence] > rank[current.confidence]) best.set(key, candidate);
    }

    return [...best.values()].sort((a, b) => a.month - b.month || a.level.localeCompare(b.level));
  }

  private serialize(run: Prisma.IntakeResearchRunGetPayload<{ select: typeof RUN_SELECT }>) {
    const { university, candidates, ...rest } = run;
    return {
      ...rest,
      universityNameMn: university.nameMn,
      universityNameEn: university.nameEn,
      candidates: (candidates as IntakeCandidate[] | null) ?? null,
    };
  }
}
