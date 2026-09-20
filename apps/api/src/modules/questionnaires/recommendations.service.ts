import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { type RecommendationRequest, RecommendationStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import {
  answersAsText,
  missingRecommenderFields,
  type QuestionnaireLevel,
  questionnaireProgress,
  recommendationDefinition,
  sanitizeAnswers,
  sanitizeRecommender,
} from './definitions/index.js';
import type {
  CreateRecommendationDto,
  SaveRecommendationAnswersDto,
  SetRecommendationStatusDto,
  UpdateRecommendationDto,
} from './dto/questionnaire.dto.js';
import { toAnswers } from './essay-questionnaire.service.js';
import { loadQuestionnaireCase } from './questionnaire-case.js';

/** Three letters is already more than any GKS level asks for; this only stops a runaway list. */
const MAX_RECOMMENDERS = 4;

/**
 * Recommendation letters (1D-27) — the office's five steps, as rows.
 *
 * 1. the teacher answers the questionnaire, through a link that needs no account
 *    (or the client types the answers in after asking them);
 * 2. the answers reach the office — that is simply the row turning `ANSWERED`;
 * 3. staff write the English letter and attach it (`LETTER_READY`);
 * 4. the client prints it, the teacher signs it and signs across the flap of an
 *    envelope that is **not** sealed;
 * 5. the envelope reaches the office (`RECEIVED`), which checks and seals it.
 *
 * A teacher's answers are shown to the client only when the client typed them.
 * The office's own instructions ask the teacher for a candid evaluation, and a
 * candid evaluation is not written for the student to read.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── The client's and staff's side ─────────────────────────────────────────

  async list(caseId: string, actor: AuthenticatedUser) {
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const [rows, essay] = await Promise.all([
      this.prisma.recommendationRequest.findMany({
        where: { caseId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.essayQuestionnaire.findUnique({ where: { caseId }, select: { level: true } }),
    ]);

    const level = (essay?.level as QuestionnaireLevel | undefined) ?? gksCase.suggestedLevel;
    const definition = level ? recommendationDefinition(level) : null;
    // A letter keeps the level it was asked at, even if the case's changed since.
    const levels = new Set<QuestionnaireLevel>(rows.map((row) => row.level as QuestionnaireLevel));
    if (level) levels.add(level);
    return {
      applicantName: gksCase.applicantName,
      level,
      definition,
      definitions: Object.fromEntries([...levels].map((each) => [each, recommendationDefinition(each)])),
      lettersNeeded: definition?.lettersNeeded ?? null,
      items: rows.map((row) => this.item(row, actor)),
    };
  }

  async create(caseId: string, dto: CreateRecommendationDto, actor: AuthenticatedUser) {
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const [count, essay] = await Promise.all([
      this.prisma.recommendationRequest.count({ where: { caseId, deletedAt: null } }),
      this.prisma.essayQuestionnaire.findUnique({ where: { caseId }, select: { level: true } }),
    ]);
    if (count >= MAX_RECOMMENDERS) {
      throw new BadRequestException(`Нэг үйлчилгээнд ${MAX_RECOMMENDERS}-өөс олон тодорхойлолт хүсэх шаардлагагүй`);
    }

    const level = dto.level ?? (essay?.level as QuestionnaireLevel | undefined) ?? gksCase.suggestedLevel;
    if (!level) throw new BadRequestException('Аль түвшний тэтгэлэгт хамрагдахаа сонгоно уу');

    const row = await this.prisma.recommendationRequest.create({
      data: {
        caseId,
        level,
        token: randomBytes(24).toString('base64url'),
        recommenderName: dto.recommenderName.trim(),
        relation: dto.relation?.trim() || null,
        filledByApplicant: dto.filledByApplicant ?? false,
      },
    });
    return this.item(row, actor);
  }

  async update(caseId: string, id: string, dto: UpdateRecommendationDto, actor: AuthenticatedUser) {
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.getRow(caseId, id);
    const staff = isStaff(actor.role);

    const touchesAnswers = dto.answers !== undefined || dto.recommender !== undefined;
    if (touchesAnswers) {
      if (!staff && !(dto.filledByApplicant ?? row.filledByApplicant)) {
        throw new ForbiddenException('Багш өөрөө бөглөх холбоостой тодорхойлолт байна');
      }
      if (!staff && row.status !== RecommendationStatus.INVITED) {
        throw new ConflictException('Хариулт илгээгдсэн тул засах боломжгүй');
      }
    }

    const definition = recommendationDefinition(row.level as QuestionnaireLevel);
    const updated = await this.prisma.recommendationRequest.update({
      where: { id },
      data: {
        ...(dto.recommenderName !== undefined && { recommenderName: dto.recommenderName.trim() }),
        ...(dto.relation !== undefined && { relation: dto.relation.trim() || null }),
        ...(dto.filledByApplicant !== undefined && { filledByApplicant: dto.filledByApplicant }),
        ...(dto.answers !== undefined && {
          answers: sanitizeAnswers(definition, { ...toAnswers(row.answers), ...dto.answers }),
        }),
        ...(dto.recommender !== undefined && {
          recommender: sanitizeRecommender(definition.recommenderFields, {
            ...toAnswers(row.recommender),
            ...dto.recommender,
          }),
        }),
      },
    });
    return this.item(updated, actor);
  }

  /** The client (on the teacher's behalf) or staff hand the answers in. */
  async submit(caseId: string, id: string, actor: AuthenticatedUser) {
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.getRow(caseId, id);
    if (!isStaff(actor.role) && !row.filledByApplicant) {
      throw new ForbiddenException('Энэ тодорхойлолтыг багш өөрөө холбоосоор илгээнэ');
    }
    return this.item(await this.markAnswered(row), actor);
  }

  async remove(caseId: string, id: string, actor: AuthenticatedUser) {
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.getRow(caseId, id);
    if (!isStaff(actor.role) && row.status !== RecommendationStatus.INVITED) {
      throw new ConflictException('Хариулт ирсэн тодорхойлолтыг устгах бол зөвлөхдөө хэлнэ үү');
    }
    // Soft delete: the link stops working at once, the answers stay on file.
    await this.prisma.recommendationRequest.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /**
   * Staff move a letter along by hand — mark the envelope received, or send a
   * questionnaire back to `INVITED` so the teacher can correct it.
   */
  async setStatus(caseId: string, id: string, dto: SetRecommendationStatusDto, actor: AuthenticatedUser) {
    if (!isStaff(actor.role)) throw new ForbiddenException('Зөвхөн ажилтан');
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.getRow(caseId, id);
    if (dto.status === RecommendationStatus.LETTER_READY && !row.letterPath) {
      throw new BadRequestException('Эхлээд англи хувилбарын файлыг хавсаргана уу');
    }

    const now = new Date();
    const updated = await this.prisma.recommendationRequest.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.staffNote !== undefined && { staffNote: dto.staffNote.trim() || null }),
        ...(dto.status === RecommendationStatus.RECEIVED && { receivedAt: now }),
        ...(dto.status === RecommendationStatus.ANSWERED && !row.answeredAt && { answeredAt: now }),
        ...(dto.status !== RecommendationStatus.RECEIVED && { receivedAt: null }),
      },
    });
    return this.item(updated, actor);
  }

  /** The English letter staff wrote from the answers — attaching it is step 3 done. */
  async attachLetter(
    caseId: string,
    id: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!isStaff(actor.role)) throw new ForbiddenException('Зөвхөн ажилтан');
    if (!file) throw new BadRequestException('Файл сонгоно уу');
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.getRow(caseId, id);

    const { path } = await this.storage.upload({ caseId, docCode: 'RECOMMENDATION_LETTER', buffer: file.buffer });
    const updated = await this.prisma.recommendationRequest.update({
      where: { id },
      data: {
        letterPath: path,
        letterName: file.originalname.replace(/[/\\]/g, '_').slice(0, 200) || 'letter.pdf',
        status: row.status === RecommendationStatus.RECEIVED ? row.status : RecommendationStatus.LETTER_READY,
        letterReadyAt: new Date(),
        answeredAt: row.answeredAt ?? new Date(),
      },
    });
    return this.item(updated, actor);
  }

  async letterUrl(caseId: string, id: string, actor: AuthenticatedUser) {
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.getRow(caseId, id);
    if (!row.letterPath) throw new NotFoundException('Англи хувилбар хараахан хавсаргагдаагүй байна');
    return { ...this.storage.sign(row.letterPath), originalName: row.letterName };
  }

  /** Staff read-out of every answered letter, for pasting into the English draft. */
  async asText(caseId: string, id: string, actor: AuthenticatedUser): Promise<string> {
    if (!isStaff(actor.role)) throw new ForbiddenException('Зөвхөн ажилтанд');
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const row = await this.getRow(caseId, id);
    const definition = recommendationDefinition(row.level as QuestionnaireLevel);
    const recommender = toAnswers(row.recommender);
    const header = definition.recommenderFields
      .map((field) => `${field.label}: ${recommender[field.id] ?? '—'}`)
      .join('\n');
    return `Өргөдөл гаргагч: ${gksCase.applicantName}\n\n${header}\n\n${answersAsText(definition, toAnswers(row.answers))}`;
  }

  // ── The teacher's side — the public link ─────────────────────────────────

  async openByToken(token: string) {
    const row = await this.getByToken(token);
    // First visit only: "the teacher opened it" is the client's reassurance
    // that the link arrived.
    if (!row.openedAt) {
      await this.prisma.recommendationRequest.update({ where: { id: row.id }, data: { openedAt: new Date() } });
    }
    return this.publicView(row);
  }

  async saveByToken(token: string, dto: SaveRecommendationAnswersDto) {
    const row = await this.getByToken(token);
    if (row.status !== RecommendationStatus.INVITED) {
      throw new ConflictException('Хариулт илгээгдсэн байна. Засах зүйл байвал өргөдөл гаргагчид хэлнэ үү.');
    }
    const definition = recommendationDefinition(row.level as QuestionnaireLevel);
    const updated = await this.prisma.recommendationRequest.update({
      where: { id: row.id },
      data: {
        ...(dto.answers !== undefined && {
          answers: sanitizeAnswers(definition, { ...toAnswers(row.answers), ...dto.answers }),
        }),
        ...(dto.recommender !== undefined && {
          recommender: sanitizeRecommender(definition.recommenderFields, {
            ...toAnswers(row.recommender),
            ...dto.recommender,
          }),
        }),
      },
    });
    return this.publicView(updated);
  }

  async submitByToken(token: string) {
    const row = await this.getByToken(token);
    return this.publicView(await this.markAnswered(row));
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async markAnswered(row: RecommendationRequest): Promise<RecommendationRequest> {
    if (row.status !== RecommendationStatus.INVITED) return row;

    const definition = recommendationDefinition(row.level as QuestionnaireLevel);
    const progress = questionnaireProgress(definition, toAnswers(row.answers));
    const missingInfo = missingRecommenderFields(definition.recommenderFields, toAnswers(row.recommender));
    if (progress.missingRequired.length || missingInfo.length) {
      throw new BadRequestException(
        `Заавал бөглөх ${progress.missingRequired.length + missingInfo.length} талбар үлдсэн байна`,
      );
    }
    return this.prisma.recommendationRequest.update({
      where: { id: row.id },
      data: { status: RecommendationStatus.ANSWERED, answeredAt: new Date() },
    });
  }

  private async getRow(caseId: string, id: string): Promise<RecommendationRequest> {
    const row = await this.prisma.recommendationRequest.findFirst({ where: { id, caseId, deletedAt: null } });
    if (!row) throw new NotFoundException('Тодорхойлолт олдсонгүй');
    return row;
  }

  private async getByToken(token: string) {
    const row = token.length >= 20 && token.length <= 64
      ? await this.prisma.recommendationRequest.findUnique({ where: { token } })
      : null;
    if (!row || row.deletedAt) {
      throw new NotFoundException('Холбоос хүчингүй болсон байна. Өргөдөл гаргагчаас шинэ холбоос авна уу.');
    }
    return row;
  }

  private async publicView(row: RecommendationRequest) {
    const owner = await this.prisma.case.findUnique({
      where: { id: row.caseId },
      select: { user: { select: { name: true, client: { select: { lastName: true, firstName: true } } } } },
    });
    const client = owner?.user.client;
    const definition = recommendationDefinition(row.level as QuestionnaireLevel);
    const answers = toAnswers(row.answers);
    return {
      applicantName: client ? `${client.lastName} ${client.firstName}` : (owner?.user.name ?? ''),
      recommenderName: row.recommenderName,
      level: row.level,
      definition,
      status: row.status,
      locked: row.status !== RecommendationStatus.INVITED,
      answers,
      recommender: toAnswers(row.recommender),
      progress: questionnaireProgress(definition, answers),
      answeredAt: row.answeredAt,
    };
  }

  private item(row: RecommendationRequest, actor: AuthenticatedUser) {
    const staff = isStaff(actor.role);
    const definition = recommendationDefinition(row.level as QuestionnaireLevel);
    const answers = toAnswers(row.answers);
    const canRead = staff || row.filledByApplicant;
    return {
      id: row.id,
      level: row.level,
      token: row.token,
      recommenderName: row.recommenderName,
      relation: row.relation,
      filledByApplicant: row.filledByApplicant,
      status: row.status,
      openedAt: row.openedAt,
      answeredAt: row.answeredAt,
      letterReadyAt: row.letterReadyAt,
      receivedAt: row.receivedAt,
      staffNote: row.staffNote,
      letterName: row.letterName,
      hasLetter: Boolean(row.letterPath),
      progress: questionnaireProgress(definition, answers),
      answers: canRead ? answers : null,
      recommender: canRead ? toAnswers(row.recommender) : null,
    };
  }
}
