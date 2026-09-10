import { describe, expect, it, vi } from 'vitest';
import { CaseStage, ServiceType, VisaStatus, VisaType } from '../../prisma/client.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { DepartureService } from '../departure/departure.service.js';
import type { CaseDocumentsService } from '../documents/case-documents.service.js';
import type { RequirementsService } from '../documents/requirements.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { VisaService } from './visa.service.js';

const ACTOR = { id: 'staff-1', role: 'CONSULTANT' } as unknown as AuthenticatedUser;

function harness(status: VisaStatus, visaType: VisaType = VisaType.D2) {
  const visaCase = { caseId: 'case-1', status, visaType };
  const updated = {
    ...visaCase,
    case: { id: 'case-1', code: 'GKS-2026-0001', userId: 'student-1', serviceType: ServiceType.BACHELOR },
  };

  const prisma = {
    visaCase: { findUnique: vi.fn().mockResolvedValue(visaCase), update: vi.fn().mockResolvedValue(updated) },
    contract: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  const cases = { applyDomainTransition: vi.fn().mockResolvedValue(true) } as unknown as CasesService & {
    applyDomainTransition: ReturnType<typeof vi.fn>;
  };
  const documents = {
    assertCaseAccess: vi.fn().mockResolvedValue(undefined),
    missingRequired: vi.fn().mockResolvedValue({ requiredTotal: 0, missing: [] }),
  } as unknown as CaseDocumentsService;
  const requirements = { resolveForCase: vi.fn().mockResolvedValue({}) } as unknown as RequirementsService;
  const departure = { ensurePlan: vi.fn().mockResolvedValue({}) } as unknown as DepartureService;
  const notifications = { dispatch: vi.fn().mockResolvedValue(1) } as unknown as NotificationsService;

  return {
    service: new VisaService(prisma, cases, documents, requirements, departure, notifications),
    prisma,
    cases,
  };
}

/**
 * 1N-19 — `REJECTED` is a terminal case stage: `case-flow.ts` builds no edge out
 * of it. A refusal that sent the case there made the REAPPLY path the visa
 * machine and the admin screen both offer unreachable — a re-submitted, approved
 * visa could never advance, and the balance invoice was refused.
 */
describe('VisaService.recordDecision — a refusal pauses the case (1N-19)', () => {
  it('parks the case ON_HOLD rather than ending it', async () => {
    const { service, cases } = harness(VisaStatus.SUBMITTED);

    await service.recordDecision('case-1', { decision: VisaStatus.REJECTED, rejectionReason: 'Санхүүгийн баримт дутуу' }, ACTOR);

    expect(cases.applyDomainTransition).toHaveBeenCalledWith('case-1', CaseStage.ON_HOLD, 'staff-1', expect.stringContaining('Виз татгалзсан'));
  });

  it('still advances the case on an approval', async () => {
    const { service, cases } = harness(VisaStatus.SUBMITTED);

    await service.recordDecision('case-1', { decision: VisaStatus.APPROVED, visaNumber: 'D2-1234' }, ACTOR);

    expect(cases.applyDomainTransition).toHaveBeenCalledWith('case-1', CaseStage.VISA_APPROVED, 'staff-1', expect.any(String));
  });
});

describe('VisaService.transition — the decision targets belong to their own endpoint (1N-20)', () => {
  it('refuses APPROVED and points at the decision endpoint', async () => {
    const { service } = harness(VisaStatus.SUBMITTED);

    await expect(service.transition('case-1', { toStatus: VisaStatus.APPROVED }, ACTOR)).rejects.toThrow(/decision/);
  });

  it('refuses REJECTED the same way', async () => {
    const { service } = harness(VisaStatus.SUBMITTED);

    await expect(service.transition('case-1', { toStatus: VisaStatus.REJECTED }, ACTOR)).rejects.toThrow(/decision/);
  });
});

/**
 * 1N-26 — a second attempt used to inherit the first one's verdict, so the
 * approval notification carried the previous refusal's text.
 */
describe('VisaService — a re-application starts clean (1N-26)', () => {
  it('clears the previous decision, its reason and its visa number', async () => {
    const { service, prisma } = harness(VisaStatus.REJECTED);

    await service.transition('case-1', { toStatus: VisaStatus.REAPPLY }, ACTOR);

    expect(prisma.visaCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ decidedAt: null, rejectionReason: null, visaNumber: null, submittedAt: null }),
      }),
    );
  });

  it('refuses to rewrite the visa type once the consulate has decided', async () => {
    const { service } = harness(VisaStatus.APPROVED, VisaType.D2);

    await expect(service.update('case-1', { visaType: VisaType.D4 }, ACTOR)).rejects.toThrow(/өөрчлөх боломжгүй/);
  });

  it('still allows a type correction while the paperwork is being collected', async () => {
    const { service, prisma } = harness(VisaStatus.COLLECTING, VisaType.D2);

    await service.update('case-1', { visaType: VisaType.D4 }, ACTOR);

    expect(prisma.visaCase.update).toHaveBeenCalled();
  });
});
