import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { QuestionnaireStatus, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ProfileQuestionnaireService } from './profile-questionnaire.service.js';

function harness(options: { serviceType?: ServiceType; caseTypes?: ServiceType[]; row?: Record<string, unknown> | null } = {}) {
  const client = {
    id: 'client-1',
    lastName: 'Бат',
    firstName: 'Болд',
    educationLevel: null,
    primaryServiceType: options.serviceType ?? ServiceType.BACHELOR,
    user: { cases: (options.caseTypes ?? []).map((serviceType) => ({ serviceType })) },
  };
  const row = options.row === null
    ? null
    : {
        id: 'pq-1',
        clientId: 'client-1',
        answers: {},
        status: QuestionnaireStatus.DRAFT,
        submittedAt: null,
        reopenNote: null,
        reopenedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...options.row,
      };
  const echo = ({ data, create, update }: { data?: object; create?: object; update?: object }) =>
    Promise.resolve({ ...(row ?? {}), ...(create ?? {}), ...(update ?? {}), ...(data ?? {}) });
  const prisma = {
    client: { findUnique: vi.fn().mockResolvedValue(client) },
    clientProfileQuestionnaire: {
      findUnique: vi.fn().mockResolvedValue(row),
      upsert: vi.fn().mockImplementation(echo),
      update: vi.fn().mockImplementation(echo),
    },
  };
  return { prisma, service: new ProfileQuestionnaireService(prisma as unknown as PrismaService) };
}

const sectionIds = (view: Awaited<ReturnType<ProfileQuestionnaireService['get']>>) =>
  view.definition.parts.flatMap((part) => part.sections.map((section) => section.id));

describe('ProfileQuestionnaireService (1B-29)', () => {
  it('asks a bachelor client for their high school, and a master client not', async () => {
    expect(sectionIds(await harness({ serviceType: ServiceType.BACHELOR }).service.get('client-1'))).toContain('high-school');
    expect(sectionIds(await harness({ serviceType: ServiceType.MASTER }).service.get('client-1'))).not.toContain('high-school');
  });

  it('asks a master client the school too once they also take language prep', async () => {
    const { service } = harness({ serviceType: ServiceType.MASTER, caseTypes: [ServiceType.LANGUAGE_PREP] });
    expect(sectionIds(await service.get('client-1'))).toContain('high-school');
  });

  it('merges the changed answers and drops keys no question asks', async () => {
    const { service, prisma } = harness({ row: { answers: { dorm: 'yes' } } });
    await service.save('client-1', { answers: { father_income: '2,000,000', invented: 'x' } }, 'client');
    expect(prisma.clientProfileQuestionnaire.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { answers: { dorm: 'yes', father_income: '2,000,000' } } }),
    );
  });

  it('locks a sent questionnaire for the client but not for staff', async () => {
    const sent = { status: QuestionnaireStatus.SUBMITTED };
    await expect(harness({ row: sent }).service.save('client-1', { answers: { dorm: 'no' } }, 'client')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(harness({ row: sent }).service.save('client-1', { answers: { dorm: 'no' } }, 'staff')).resolves.toBeTruthy();
  });

  it('will not send while a required answer is missing', async () => {
    const { service } = harness({ serviceType: ServiceType.MASTER, row: { answers: { dorm: 'yes' } } });
    await expect(service.submit('client-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends once the required answers are in', async () => {
    const { service, prisma } = harness({ serviceType: ServiceType.MASTER, row: { answers: { dorm: 'yes', sponsor_other: 'no' } } });
    await service.submit('client-1');
    expect(prisma.clientProfileQuestionnaire.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: QuestionnaireStatus.SUBMITTED }) }),
    );
  });
});
