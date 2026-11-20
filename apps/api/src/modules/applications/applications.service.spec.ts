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
  isPrimary?: boolean;
  caseRow?: Record<string, unknown>;
  clash?: boolean;
}) {
  const application = {
    id: 'app-1',
    caseId: 'case-1',
    isPrimary: options.isPrimary ?? true,
    status: options.status ?? ApplicationStatus.UNDER_REVIEW,
    case: { id: 'case-1', code: 'GKS-2026-0001', userId: 'student-1', serviceType: options.serviceType ?? ServiceType.BACHELOR },
    university: { nameMn: 'Кёнхи их сургууль' },
  };
  const results = options.results ?? { 1: null, 2: null };

  const prisma = {
    application: {
      findUnique: vi.fn().mockResolvedValue(application),
      findFirst: vi.fn().mockResolvedValue(options.clash ? { id: 'other' } : null),
      update: vi.fn().mockResolvedValue(application),
      create: vi.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
      delete: vi.fn().mockResolvedValue(application),
    },
    case: { findUnique: vi.fn().mockResolvedValue(options.caseRow ?? null) },
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
  const documents = {
    // Nothing collected: a primary application could not be marked ready.
    missingRequired: vi.fn().mockResolvedValue({ requiredTotal: 2, missing: [{ id: 'd', template: { code: 'x', nameMn: 'Паспорт' }, status: 'NOT_STARTED' }] }),
  } as unknown as CaseDocumentsService;
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

/**
 * 1E-13 — the office sends the same materials to a second school beside the
 * case's own submission. That one is tracked, but the case follows the primary.
 */
describe('ApplicationsService — parallel applications (1E-13)', () => {
  const GKS_CASE = {
    serviceType: ServiceType.GKS_SCHOLARSHIP,
    universityId: 'snu',
    universityChoices: [
      { universityId: 'snu', track: 'SCHOLARSHIP', programId: null },
      { universityId: 'ku', track: 'SCHOLARSHIP', programId: null },
      { universityId: 'kyunghee', track: 'REGULAR', programId: 'prog-1' },
    ],
    applications: [{ universityId: 'snu' }],
  };

  it('opens one on the GKS case`s ordinary-brokerage school, carrying the choice`s programme', async () => {
    const { service, prisma } = harness({ caseRow: GKS_CASE });

    await service.createParallel('case-1', { universityId: 'kyunghee' });

    expect(prisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: false, universityId: 'kyunghee', programId: 'prog-1' }) }),
    );
  });

  it.each([ServiceType.LANGUAGE_PREP, ServiceType.BACHELOR])(
    'opens one on any further school of a %s case — the office applies to several at once',
    async (serviceType) => {
      const { service, prisma } = harness({
        caseRow: {
          serviceType,
          universityId: 'a',
          universityChoices: [
            { universityId: 'a', track: 'REGULAR', programId: null },
            { universityId: 'b', track: 'REGULAR', programId: null },
            { universityId: 'c', track: 'REGULAR', programId: null },
          ],
          applications: [{ universityId: 'a' }],
        },
      });

      await service.createParallel('case-1', { universityId: 'b' });
      await service.createParallel('case-1', { universityId: 'c' });
      await expect(service.createParallel('case-1', { universityId: 'a' })).rejects.toThrow(/бусад сургууль/);

      expect(prisma.application.create).toHaveBeenCalledTimes(2);
    },
  );

  it('refuses a scholarship school — those are all the one NIIED submission', async () => {
    const { service, prisma } = harness({ caseRow: GKS_CASE });

    await expect(service.createParallel('case-1', { universityId: 'ku' })).rejects.toThrow(/энгийн зуучлалын/);
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it('refuses a school the case never chose', async () => {
    const { service } = harness({ caseRow: GKS_CASE });

    await expect(service.createParallel('case-1', { universityId: 'yonsei' })).rejects.toThrow(/сонгосон/);
  });

  it('refuses a second application to the same school', async () => {
    const { service } = harness({ caseRow: GKS_CASE, clash: true });

    await expect(service.createParallel('case-1', { universityId: 'kyunghee' })).rejects.toThrow(/аль хэдийн/);
  });

  it('can be marked ready while the shared checklist is still open — the gate guards the primary only', async () => {
    const { service, prisma } = harness({ isPrimary: false, status: ApplicationStatus.PREPARING });

    await service.transition('app-1', { toStatus: ApplicationStatus.READY }, ACTOR);

    expect(prisma.application.update).toHaveBeenCalled();
  });

  it('still gates the primary on the checklist', async () => {
    const { service } = harness({ status: ApplicationStatus.PREPARING });

    await expect(service.transition('app-1', { toStatus: ApplicationStatus.READY }, ACTOR)).rejects.toThrow(/материал/);
  });

  it('is submitted without moving the case or closing out its documents', async () => {
    const { service, cases, prisma } = harness({ isPrimary: false, status: ApplicationStatus.READY });

    await service.transition('app-1', { toStatus: ApplicationStatus.SUBMITTED }, ACTOR);

    expect(cases.applyDomainTransition).not.toHaveBeenCalled();
    expect(prisma.caseDocument.findMany).not.toHaveBeenCalled();
  });

  it('records its answer and tells the client, but leaves the case where the primary put it', async () => {
    const { service, cases, notifications, prisma } = harness({
      isPrimary: false,
      serviceType: ServiceType.GKS_SCHOLARSHIP,
      status: ApplicationStatus.UNDER_REVIEW,
    });

    await service.recordResult('app-1', { decision: ApplicationDecision.PASSED }, ACTOR);

    expect(cases.applyDomainTransition).not.toHaveBeenCalled();
    expect(notifications.dispatch).toHaveBeenCalled();
    // A GKS case's fallback school is ordinary brokerage: one round, concluded.
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ApplicationStatus.ACCEPTED }) }),
    );
  });

  it('decides in one round even on a GKS case', async () => {
    const { service } = harness({
      isPrimary: false,
      serviceType: ServiceType.GKS_SCHOLARSHIP,
      status: ApplicationStatus.UNDER_REVIEW,
      results: { 1: { round: 1, decision: ApplicationDecision.PASSED }, 2: null },
    });

    await expect(
      service.recordResult('app-1', { decision: ApplicationDecision.PASSED, round: 2 }, ACTOR),
    ).rejects.toThrow(/2-р шатны/);
  });

  it('may be removed before it is sent, never after', async () => {
    const draft = harness({ isPrimary: false, status: ApplicationStatus.PREPARING });
    await draft.service.removeParallel('app-1');
    expect(draft.prisma.application.delete).toHaveBeenCalled();

    const sent = harness({ isPrimary: false, status: ApplicationStatus.SUBMITTED });
    await expect(sent.service.removeParallel('app-1')).rejects.toThrow(/илгээсэн/);
  });

  it('never removes the primary', async () => {
    const { service } = harness({ status: ApplicationStatus.PREPARING });

    await expect(service.removeParallel('app-1')).rejects.toThrow(/Үндсэн/);
  });
});
