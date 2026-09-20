import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { type EssayQuestionnaire, QuestionnaireStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type Answers,
  answersAsText,
  essayDefinition,
  type QuestionnaireLevel,
  questionnaireProgress,
  sanitizeAnswers,
} from './definitions/index.js';
import type { ReopenEssayDto, SaveEssayDto } from './dto/questionnaire.dto.js';
import { loadQuestionnaireCase } from './questionnaire-case.js';

/**
 * The client's essay questionnaire (1D-27): one per GKS case, filled in over
 * several sittings, then handed to the office's writer.
 *
 * Every save is a merge of the answers that changed — the portal autosaves as
 * the client types, and a whole questionnaire of honest Mongolian paragraphs
 * outgrows a request body quickly.
 */
@Injectable()
export class EssayQuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  async get(caseId: string, actor: AuthenticatedUser) {
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.prisma.essayQuestionnaire.findUnique({ where: { caseId } });
    return this.view(row, gksCase.suggestedLevel, gksCase.applicantName);
  }

  async save(caseId: string, dto: SaveEssayDto, actor: AuthenticatedUser) {
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const existing = await this.prisma.essayQuestionnaire.findUnique({ where: { caseId } });

    if (existing?.status === QuestionnaireStatus.SUBMITTED) {
      throw new ConflictException('Асуулга мэргэжилтэнд илгээгдсэн тул засах боломжгүй. Засах зүйл байвал зөвлөхдөө хэлнэ үү.');
    }

    const level = dto.level ?? (existing?.level as QuestionnaireLevel | undefined);
    if (!level) throw new BadRequestException('Аль түвшний тэтгэлэгт хамрагдахаа сонгоно уу');

    const definition = essayDefinition(level);
    const answers = sanitizeAnswers(definition, { ...toAnswers(existing?.answers), ...(dto.answers ?? {}) });

    const row = await this.prisma.essayQuestionnaire.upsert({
      where: { caseId },
      create: { caseId, level, answers },
      update: { level, answers },
    });
    return this.view(row, gksCase.suggestedLevel, gksCase.applicantName);
  }

  /** Hands the answers to the writer. Only the required questions gate this. */
  async submit(caseId: string, actor: AuthenticatedUser) {
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const existing = await this.prisma.essayQuestionnaire.findUnique({ where: { caseId } });
    if (!existing) throw new BadRequestException('Асуулга хараахан бөглөгдөөгүй байна');
    if (existing.status === QuestionnaireStatus.SUBMITTED) {
      return this.view(existing, gksCase.suggestedLevel, gksCase.applicantName);
    }

    const definition = essayDefinition(existing.level as QuestionnaireLevel);
    const progress = questionnaireProgress(definition, toAnswers(existing.answers));
    if (progress.missingRequired.length) {
      throw new BadRequestException(`Заавал хариулах ${progress.missingRequired.length} асуулт үлдсэн байна`);
    }

    const row = await this.prisma.essayQuestionnaire.update({
      where: { caseId },
      data: { status: QuestionnaireStatus.SUBMITTED, submittedAt: new Date(), reopenNote: null },
    });
    return this.view(row, gksCase.suggestedLevel, gksCase.applicantName);
  }

  /** Staff send it back with a note saying what to add. */
  async reopen(caseId: string, dto: ReopenEssayDto, actor: AuthenticatedUser) {
    if (!isStaff(actor.role)) throw new ForbiddenException('Зөвхөн ажилтан буцааж нээнэ');
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.prisma.essayQuestionnaire.update({
      where: { caseId },
      data: { status: QuestionnaireStatus.DRAFT, reopenNote: dto.note.trim(), reopenedAt: new Date() },
    });
    return this.view(row, gksCase.suggestedLevel, gksCase.applicantName);
  }

  /** The writer's copy: every asked question and its answer, as one block of text. */
  async asText(caseId: string, actor: AuthenticatedUser): Promise<string> {
    if (!isStaff(actor.role)) throw new ForbiddenException('Зөвхөн ажилтанд');
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.prisma.essayQuestionnaire.findUnique({ where: { caseId } });
    if (!row) return '';
    const definition = essayDefinition(row.level as QuestionnaireLevel);
    return `${gksCase.applicantName}\n\n${answersAsText(definition, toAnswers(row.answers))}`;
  }

  private view(row: EssayQuestionnaire | null, suggestedLevel: QuestionnaireLevel | null, applicantName: string) {
    const level = (row?.level as QuestionnaireLevel | undefined) ?? null;
    const definition = level ? essayDefinition(level) : null;
    const answers = toAnswers(row?.answers);
    return {
      applicantName,
      suggestedLevel,
      level,
      definition,
      questionnaire: row
        ? {
            status: row.status,
            answers,
            submittedAt: row.submittedAt,
            reopenNote: row.reopenNote,
            reopenedAt: row.reopenedAt,
            updatedAt: row.updatedAt,
          }
        : null,
      progress: definition ? questionnaireProgress(definition, answers) : null,
    };
  }
}

/** A JSON column read back as the answer map it was written as. */
export function toAnswers(value: unknown): Answers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}
