import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { QuestionnaireStatus, RecommendationStatus, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import { allQuestions, essayDefinition, recommendationDefinition } from './definitions/index.js';
import { EssayQuestionnaireService } from './essay-questionnaire.service.js';
import { RecommendationsService } from './recommendations.service.js';

const OWNER = { id: 'student-1', role: Role.USER } as unknown as AuthenticatedUser;
const STRANGER = { id: 'student-2', role: Role.USER } as unknown as AuthenticatedUser;
const STAFF = { id: 'staff-1', role: Role.CONSULTANT } as unknown as AuthenticatedUser;

function requiredAnswers(ids: { id: string; required?: boolean; options?: readonly string[] }[]) {
  return Object.fromEntries(ids.filter((q) => q.required).map((q) => [q.id, q.options?.[0] ?? 'хариулт']));
}

function harness(options: { serviceType?: ServiceType; essay?: unknown; recommendation?: Record<string, unknown> } = {}) {
  const gksCase = {
    id: 'case-1',
    userId: OWNER.id,
    serviceType: options.serviceType ?? ServiceType.GKS_SCHOLARSHIP,
    program: null,
    intake: null,
    conditions: { educationLevel: 'SECONDARY_SCHOOL' },
    user: { name: 'Bold', client: { lastName: 'Бат', firstName: 'Болд' } },
  };
  const recommendation = options.recommendation
    ? {
        id: 'rec-1',
        caseId: 'case-1',
        level: 'BACHELOR',
        token: 't'.repeat(32),
        recommenderName: 'Сарангэрэл багш',
        relation: null,
        answers: {},
        recommender: {},
        filledByApplicant: false,
        status: RecommendationStatus.INVITED,
        openedAt: null,
        answeredAt: null,
        letterReadyAt: null,
        receivedAt: null,
        letterPath: null,
        letterName: null,
        staffNote: null,
        deletedAt: null,
        ...options.recommendation,
      }
    : null;

  const prisma = {
    case: { findUnique: vi.fn().mockResolvedValue(gksCase) },
    essayQuestionnaire: {
      findUnique: vi.fn().mockResolvedValue(options.essay ?? null),
      upsert: vi.fn().mockImplementation(({ create }: { create: object }) => ({ ...create, status: 'DRAFT', updatedAt: new Date() })),
      update: vi.fn().mockImplementation(({ data }: { data: object }) => ({ ...(options.essay as object), ...data })),
    },
    recommendationRequest: {
      findFirst: vi.fn().mockResolvedValue(recommendation),
      findUnique: vi.fn().mockResolvedValue(recommendation),
      findMany: vi.fn().mockResolvedValue(recommendation ? [recommendation] : []),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: { data: object }) => ({ ...recommendation, ...data })),
      update: vi.fn().mockImplementation(({ data }: { data: object }) => ({ ...recommendation, ...data })),
    },
  } as unknown as PrismaService;

  const storage = { upload: vi.fn(), sign: vi.fn() } as unknown as StorageService;
  return {
    prisma,
    essay: new EssayQuestionnaireService(prisma),
    recommendations: new RecommendationsService(prisma, storage),
  };
}

describe('EssayQuestionnaireService (1D-27)', () => {
  it('refuses a case that is not GKS — the essay is scholarship paperwork', async () => {
    const { essay } = harness({ serviceType: ServiceType.BACHELOR });
    await expect(essay.get('case-1', OWNER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses another client’s case', async () => {
    const { essay } = harness();
    await expect(essay.get('case-1', STRANGER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('suggests a level from the applicant’s education before any is chosen', async () => {
    const { essay } = harness();
    const view = await essay.get('case-1', OWNER);
    expect(view.suggestedLevel).toBe('BACHELOR');
    expect(view.definition).toBeNull();
  });

  it('merges an autosave into what was already there, dropping unknown keys', async () => {
    const { essay, prisma } = harness({
      essay: { caseId: 'case-1', level: 'BACHELOR', answers: { major: 'Хими' }, status: QuestionnaireStatus.DRAFT },
    });
    await essay.save('case-1', { answers: { majorWhy: 'Учир нь…', planted: 'x' } }, OWNER);
    const call = vi.mocked(prisma.essayQuestionnaire.upsert).mock.calls[0]![0];
    expect(call.update.answers).toEqual({ major: 'Хими', majorWhy: 'Учир нь…' });
  });

  it('locks the answers once they are with the writer', async () => {
    const { essay } = harness({
      essay: { caseId: 'case-1', level: 'BACHELOR', answers: {}, status: QuestionnaireStatus.SUBMITTED },
    });
    await expect(essay.save('case-1', { answers: { major: 'x' } }, OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('will not submit while a required question is empty', async () => {
    const { essay } = harness({
      essay: { caseId: 'case-1', level: 'BACHELOR', answers: { major: 'Хими' }, status: QuestionnaireStatus.DRAFT },
    });
    await expect(essay.submit('case-1', OWNER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submits once the required questions are answered', async () => {
    const answers = requiredAnswers(allQuestions(essayDefinition('BACHELOR')));
    const { essay } = harness({
      essay: { caseId: 'case-1', level: 'BACHELOR', answers, status: QuestionnaireStatus.DRAFT },
    });
    const view = await essay.submit('case-1', OWNER);
    expect(view.questionnaire?.status).toBe(QuestionnaireStatus.SUBMITTED);
  });

  it('lets only staff reopen it', async () => {
    const { essay } = harness({
      essay: { caseId: 'case-1', level: 'BACHELOR', answers: {}, status: QuestionnaireStatus.SUBMITTED },
    });
    await expect(essay.reopen('case-1', { note: 'x' }, OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    const view = await essay.reopen('case-1', { note: ' Ажлын туршлагаа нэмнэ үү ' }, STAFF);
    expect(view.questionnaire?.status).toBe(QuestionnaireStatus.DRAFT);
    expect(view.questionnaire?.reopenNote).toBe('Ажлын туршлагаа нэмнэ үү');
  });
});

describe('RecommendationsService (1D-27)', () => {
  it('keeps a teacher’s own answers from the student', async () => {
    const { recommendations } = harness({ recommendation: { answers: { finalWord: 'Маш хичээнгүй' } } });
    const [asClient] = (await recommendations.list('case-1', OWNER)).items;
    const [asStaff] = (await recommendations.list('case-1', STAFF)).items;
    expect(asClient!.answers).toBeNull();
    expect(asStaff!.answers).toEqual({ finalWord: 'Маш хичээнгүй' });
  });

  it('shows the answers to a client who typed them in', async () => {
    const { recommendations } = harness({
      recommendation: { filledByApplicant: true, answers: { finalWord: 'Маш хичээнгүй' } },
    });
    const [item] = (await recommendations.list('case-1', OWNER)).items;
    expect(item!.answers).toEqual({ finalWord: 'Маш хичээнгүй' });
  });

  it('does not let the client write into a questionnaire the teacher answers through the link', async () => {
    const { recommendations } = harness({ recommendation: {} });
    await expect(
      recommendations.update('case-1', 'rec-1', { answers: { finalWord: 'сайн' } }, OWNER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('opens by token for the teacher and records the first visit only', async () => {
    const { recommendations, prisma } = harness({ recommendation: {} });
    const view = await recommendations.openByToken('t'.repeat(32));
    expect(view.applicantName).toBe('Бат Болд');
    expect(view.locked).toBe(false);
    expect(prisma.recommendationRequest.update).toHaveBeenCalledTimes(1);
  });

  it('answers a withdrawn link with "no longer valid"', async () => {
    const { recommendations } = harness({ recommendation: { deletedAt: new Date() } });
    await expect(recommendations.openByToken('t'.repeat(32))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a malformed token without asking the database', async () => {
    const { recommendations, prisma } = harness({ recommendation: {} });
    await expect(recommendations.openByToken('short')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recommendationRequest.findUnique).not.toHaveBeenCalled();
  });

  it('needs the teacher’s own details before the answers count as sent', async () => {
    const definition = recommendationDefinition('BACHELOR');
    const { recommendations } = harness({ recommendation: { answers: requiredAnswers(allQuestions(definition)) } });
    await expect(recommendations.submitByToken('t'.repeat(32))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('turns ANSWERED when questions and details are complete, then locks the link', async () => {
    const definition = recommendationDefinition('BACHELOR');
    const recommender = Object.fromEntries(definition.recommenderFields.map((field) => [field.id, 'x']));
    const { recommendations } = harness({
      recommendation: { answers: requiredAnswers(allQuestions(definition)), recommender },
    });
    const view = await recommendations.submitByToken('t'.repeat(32));
    expect(view.status).toBe(RecommendationStatus.ANSWERED);

    const locked = harness({ recommendation: { status: RecommendationStatus.ANSWERED } });
    await expect(locked.recommendations.saveByToken('t'.repeat(32), { answers: {} })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('will not mark a letter ready before its English file is attached', async () => {
    const { recommendations } = harness({ recommendation: { status: RecommendationStatus.ANSWERED } });
    await expect(
      recommendations.setStatus('case-1', 'rec-1', { status: RecommendationStatus.LETTER_READY }, STAFF),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
