import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PROGRAM_RESEARCH_JOB, PROGRAM_RESEARCH_QUEUE } from '../../../queue/queue.constants.js';
import { IntakeResearchStatus, Prisma, type ProgramLevel } from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AdmissionConfigService } from '../../admissions/admission-config.service.js';
import { GeminiService, extractJson } from '../../admissions/research/gemini.service.js';
import { StudyFieldsService } from '../study-fields.service.js';
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
    private readonly config: AdmissionConfigService,
    private readonly studyFields: StudyFieldsService,
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

    const model = (await this.config.get()).researchModel;

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
      const fields = await this.studyFields.findAll();
      const links = (run.university.links ?? {}) as { officialWebsite?: string | null };

      const prompt = buildProgramResearchPrompt({
        nameMn: run.university.nameMn,
        nameEn: run.university.nameEn,
        nameKo: run.university.nameKo,
        cityEn: run.university.cityEn,
        officialWebsite: links.officialWebsite ?? null,
        year: run.year,
        levels: run.levels,
        fieldMenu: this.buildFieldMenu(fields),
      });

      const answer = await this.gemini.generateJson({
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
      const grounded = this.gemini.isMock || answer.sources.length > 0;
      if (!grounded) {
        this.logger.warn(
          `Grounding хоосон (${runId}): загвар хайлт хийлгүй хариулсан тул бүх саналыг LOW болголоо`,
        );
      }

      const knownFieldSlugs = new Set(
        fields.flatMap((group) => [group.slug, ...group.children.map((child) => child.slug)]),
      );

      // Two guards, in order: the reply must be JSON, and the JSON must be the
      // shape we asked for. Anything else is a failed run, not a half-filled
      // review list for somebody to untangle.
      const parsed = parseProgramResearchResult(extractJson(answer.text), { knownFieldSlugs, grounded });
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
   * The taxonomy as lines the model picks a slug from. Groups are listed as
   * headings and are not offered as answers: "Бизнес" is never the right
   * filing for a department, and offering it invites the model to take the
   * easy option.
   */
  private buildFieldMenu(fields: Awaited<ReturnType<StudyFieldsService['findAll']>>): string {
    return fields
      .filter((group) => group.children.length > 0)
      .map((group) => {
        const children = group.children
          .map((child) => `    ${child.slug} — ${child.nameKo ?? child.nameEn} (${child.nameEn})`)
          .join('\n');
        return `  ${group.nameEn}:\n${children}`;
      })
      .join('\n');
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
    };
  }
}
