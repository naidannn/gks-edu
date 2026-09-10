import { describe, expect, it, vi } from 'vitest';
import {
  ApplicationDecision,
  ApplicationStatus,
  CaseStage,
  ServiceType,
} from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { CasesService } from '../cases/cases.service.js';
import type { CaseDocumentsService } from '../documents/case-documents.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { ApplicationsService } from './applications.service.js';

const ACTOR = { id: 'staff-1', role: 'CONSULTANT' } as unknown as AuthenticatedUser;

function harness(options: {
  status?: ApplicationStatus;
  serviceType?: ServiceType;
  results?: Record<1 | 2, Record<string, unknown> | null>;
}) {
  const application = {
    id: 'app-1',
    caseId: 'case-1',
    status: options.status ?? ApplicationStatus.UNDER_REVIEW,
    case: { id: 'case-1', code: 'GKS-2026-0001', userId: 'student-1', serviceType: options.serviceType ?? ServiceType.BACHELOR },
    university: { nameMn: 'Кёнхи их сургууль' },
  };
  const results = options.results ?? { 1: null, 2: null };

  const prisma = {
    application: {
      findUnique: vi.fn().mockResolvedValue(application),
      update: vi.fn().mockResolvedValue(application),
    },
    applicationResult: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { applicationId_round: { round: 1 | 2 } } }) =>
        Promise.resolve(results[where.applicationId_round.round]),
      ),
      upsert: vi.fn().mockResolvedValue({}),
    },
    caseDocument: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const cases = { applyDomainTransition: vi.fn().mockResolvedValue(true) } as unknown as CasesService & {
    applyDomainTransition: ReturnType<typeof vi.fn>;
  };
  const documents = { missingRequired: vi.fn().mockResolvedValue({ requiredTotal: 0, missing: [] }) } as unknown as CaseDocumentsService;
  const notifications = { dispatch: vi.fn().mockResolvedValue(1) } as unknown as NotificationsService;

  return { service: new ApplicationsService(prisma, cases, documents, notifications), prisma, cases, notifications };
}

/**
 * 1N-20 — `recordResult` had no status precondition, so a decision recorded on
 * an application still `PREPARING` jumped it to `ACCEPTED` and emailed the
 * client "тэнцлээ", while the case-stage move quietly failed. The two then told
 * different stories about the same client.
 */
describe('ApplicationsService.recordResult — when a decision may be recorded (1N-20)', () => {
  it('refuses a result on an application the school has not received', async () => {
    const { service, notifications } = harness({ status: ApplicationStatus.PREPARING });

    await expect(
      service.recordResult('app-1', { decision: ApplicationDecision.PASSED }, ACTOR),
    ).rejects.toThrow(/төлөвтэй байхад/);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('accepts one on an application under review', async () => {
    const { service, cases } = harness({ status: ApplicationStatus.UNDER_REVIEW });

    await service.recordResult('app-1', { decision: ApplicationDecision.PASSED }, ACTOR);

    expect(cases.applyDomainTransition).toHaveBeenCalledWith('case-1', CaseStage.ADMITTED, 'staff-1', expect.any(String));
  });

  it('still lets a concluded round be corrected — ACCEPTED has no way back, so a typo would be permanent', async () => {
    const { service } = harness({
      status: ApplicationStatus.ACCEPTED,
      results: { 1: { round: 1, decision: ApplicationDecision.PASSED }, 2: null },
    });

    await expect(service.recordResult('app-1', { decision: ApplicationDecision.FAILED }, ACTOR)).resolves.toBeDefined();
  });

  it('refuses to rewrite round 1 once round 2 has been decided on top of it', async () => {
    const { service } = harness({
      status: ApplicationStatus.UNDER_REVIEW,
      serviceType: ServiceType.GKS_SCHOLARSHIP,
      results: {
        1: { round: 1, decision: ApplicationDecision.PASSED },
        2: { round: 2, decision: ApplicationDecision.PASSED },
      },
    });

    await expect(
      service.recordResult('app-1', { decision: ApplicationDecision.FAILED, round: 1 }, ACTOR),
    ).rejects.toThrow(/2-р шатны хариу/);
  });
});

/**
 * 1N-19 — `REJECTED` is terminal: the stage graph builds no edge out of it. A
 * school refusal that moved the case there foreclosed the fallback school a GKS
 * contract promises free of charge (§3.11).
 */
describe('ApplicationsService — a refusal pauses the case rather than ending it (1N-19)', () => {
  it('parks the case ON_HOLD so staff can decide, and can still reach REJECTED deliberately', async () => {
    const { service, cases } = harness({ status: ApplicationStatus.UNDER_REVIEW });

    await service.recordResult('app-1', { decision: ApplicationDecision.FAILED }, ACTOR);

    expect(cases.applyDomainTransition).toHaveBeenCalledWith('case-1', CaseStage.ON_HOLD, 'staff-1', expect.any(String));
  });
});

/**
 * 1N-20 — reached through the generic transition endpoint there is no
 * `ApplicationResult`, no `decidedAt`, no case move and no notification.
 */
describe('ApplicationsService.transition — the decision targets belong to their own endpoint (1N-20)', () => {
  it('refuses ACCEPTED and points at the results endpoint', async () => {
    const { service } = harness({ status: ApplicationStatus.UNDER_REVIEW });

    await expect(
      service.transition('app-1', { toStatus: ApplicationStatus.ACCEPTED }, ACTOR),
    ).rejects.toThrow(/results/);
  });

  it('refuses REJECTED the same way', async () => {
    const { service } = harness({ status: ApplicationStatus.UNDER_REVIEW });

    await expect(
      service.transition('app-1', { toStatus: ApplicationStatus.REJECTED }, ACTOR),
    ).rejects.toThrow(/results/);
  });

  it('leaves the ordinary moves alone', async () => {
    const { service, prisma } = harness({ status: ApplicationStatus.UNDER_REVIEW });

    await service.transition('app-1', { toStatus: ApplicationStatus.INTERVIEW_SCHEDULED }, ACTOR);

    expect(prisma.application.update).toHaveBeenCalled();
  });
});
