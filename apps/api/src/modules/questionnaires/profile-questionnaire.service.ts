import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CaseStage, type ClientProfileQuestionnaire, type Prisma, QuestionnaireStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  answersAsText,
  asksHighSchool,
  PROFILE_QUESTIONS,
  profileDefinition,
  questionnaireProgress,
  sanitizeAnswers,
} from './definitions/index.js';
import type { ReopenEssayDto, SaveProfileQuestionnaireDto } from './dto/questionnaire.dto.js';
import { toAnswers } from './essay-questionnaire.service.js';

/** Who is acting decides one thing only: a client cannot edit once it is sent. */
type Actor = 'client' | 'staff';

const CLIENT_SELECT = {
  id: true,
  lastName: true,
  firstName: true,
  educationLevel: true,
  primaryServiceType: true,
  user: { select: { cases: { where: { stage: { not: CaseStage.CANCELLED } }, select: { serviceType: true } } } },
} satisfies Prisma.ClientSelect;

type QuestionnaireClient = Prisma.ClientGetPayload<{ select: typeof CLIENT_SELECT }>;

/**
 * The client's «Нэмэлт мэдээллийн асуулга» (1B-29): one per client, filled in
 * from the cabinet after they sign on, autosaved like the essay questionnaire.
 *
 * Staff may fill it in on the client's behalf — a family that brings the
 * answers to the office is common — and may correct it after it was sent; the
 * client edits only a draft.
 */
@Injectable()
export class ProfileQuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  /** The client record behind a portal account; the questionnaire waits for one. */
  async clientIdForUser(userId: string): Promise<string> {
    const client = await this.prisma.client.findUnique({ where: { userId }, select: { id: true } });
    if (!client) throw new BadRequestException('Эхлээд «Миний мэдээлэл» хэсгээ бөглөнө үү');
    return client.id;
  }

  async get(clientId: string) {
    const { client, row } = await this.load(clientId);
    return this.view(client, row);
  }

  async save(clientId: string, dto: SaveProfileQuestionnaireDto, actor: Actor) {
    const { client, row: existing } = await this.load(clientId);
    if (actor === 'client' && existing?.status === QuestionnaireStatus.SUBMITTED) {
      throw new ConflictException('Асуулга илгээгдсэн тул засах боломжгүй. Засах зүйл байвал зөвлөхдөө хэлнэ үү.');
    }

    const answers = sanitizeAnswers(PROFILE_QUESTIONS, { ...toAnswers(existing?.answers), ...(dto.answers ?? {}) });
    const row = await this.prisma.clientProfileQuestionnaire.upsert({
      where: { clientId },
      create: { clientId, answers },
      update: { answers },
    });
    return this.view(client, row);
  }

  /** Hands the answers to the office. Only the required questions gate this. */
  async submit(clientId: string) {
    const { client, row: existing } = await this.load(clientId);
    if (!existing) throw new BadRequestException('Асуулга хараахан бөглөгдөөгүй байна');
    if (existing.status === QuestionnaireStatus.SUBMITTED) return this.view(client, existing);

    const progress = questionnaireProgress(this.definitionFor(client), toAnswers(existing.answers));
    if (progress.missingRequired.length) {
      throw new BadRequestException(`Заавал хариулах ${progress.missingRequired.length} асуулт үлдсэн байна`);
    }

    const row = await this.prisma.clientProfileQuestionnaire.update({
      where: { clientId },
      data: { status: QuestionnaireStatus.SUBMITTED, submittedAt: new Date(), reopenNote: null },
    });
    return this.view(client, row);
  }

  /** Staff send it back with a note saying what to add. */
  async reopen(clientId: string, dto: ReopenEssayDto) {
    const { client, row: existing } = await this.load(clientId);
    if (!existing) throw new BadRequestException('Асуулга хараахан бөглөгдөөгүй байна');
    const row = await this.prisma.clientProfileQuestionnaire.update({
      where: { clientId },
      data: { status: QuestionnaireStatus.DRAFT, reopenNote: dto.note.trim(), reopenedAt: new Date() },
    });
    return this.view(client, row);
  }

  /** Every asked question and its answer as one block of text, for pasting into a school's form. */
  async asText(clientId: string): Promise<string> {
    const { client, row } = await this.load(clientId);
    if (!row) return '';
    const name = `${client.lastName} ${client.firstName}`;
    return `${name}\n\n${answersAsText(this.definitionFor(client), toAnswers(row.answers))}`;
  }

  private async load(clientId: string) {
    const [client, row] = await Promise.all([
      this.loadClient(clientId),
      this.prisma.clientProfileQuestionnaire.findUnique({ where: { clientId } }),
    ]);
    return { client, row };
  }

  private async loadClient(clientId: string): Promise<QuestionnaireClient> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: CLIENT_SELECT });
    if (!client) throw new NotFoundException('Үйлчлүүлэгч олдсонгүй');
    return client;
  }

  /** Every live service counts — a client on a master's who also takes language prep is asked the school. */
  private definitionFor(client: QuestionnaireClient) {
    const serviceTypes = [client.primaryServiceType, ...client.user.cases.map((row) => row.serviceType)];
    return profileDefinition({ asksHighSchool: asksHighSchool({ serviceTypes, educationLevel: client.educationLevel }) });
  }

  private view(client: QuestionnaireClient, row: ClientProfileQuestionnaire | null) {
    const definition = this.definitionFor(client);
    const answers = toAnswers(row?.answers);
    return {
      applicantName: `${client.lastName} ${client.firstName}`,
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
      progress: questionnaireProgress(definition, answers),
    };
  }
}
