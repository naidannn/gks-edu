import { describe, expect, it, vi } from 'vitest';
import { NotificationEvent, Role, VisaType } from '../../prisma/client.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { CaseDocumentsService } from '../documents/case-documents.service.js';
import type { FxService } from '../fx/fx.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { VisaService } from '../visa/visa.service.js';
import { SchoolInvoicesService } from './school-invoices.service.js';

const STAFF = { id: 'staff-1', role: Role.CONSULTANT } as unknown as AuthenticatedUser;

function harness(known: Record<string, unknown> | null) {
  const prisma = {
    invitation: {
      findUnique: vi.fn().mockResolvedValue(known),
      upsert: vi.fn().mockResolvedValue({ caseId: 'case-1', number: 'INV-1' }),
    },
  } as unknown as PrismaService;

  const fx = { current: vi.fn() } as unknown as FxService;
  const cases = { applyDomainTransition: vi.fn().mockResolvedValue(true) } as unknown as CasesService;
  const documents = { assertCaseAccess: vi.fn().mockResolvedValue(undefined) } as unknown as CaseDocumentsService;
  const visa = { openForCase: vi.fn().mockResolvedValue({ visaCase: { visaType: VisaType.D2 } }) } as unknown as VisaService;
  const storage = { upload: vi.fn() } as unknown as StorageService;
  const notifications = { dispatchForCase: vi.fn().mockResolvedValue(1) } as unknown as NotificationsService;

  return {
    service: new SchoolInvoicesService(prisma, fx, cases, documents, visa, storage, notifications),
    notifications,
  };
}

/**
 * 1N-26 — the upsert dispatched unconditionally, so re-recording an invitation
 * to fix a typo re-sent both the invitation and the "visa stage started" event
 * on every channel, SMS included.
 */
describe('SchoolInvoicesService.recordInvitation — the client hears about it once (1N-26)', () => {
  it('sends both events the first time the invitation is recorded', async () => {
    const { service, notifications } = harness(null);

    await service.recordInvitation('case-1', { number: 'INV-1' }, undefined, STAFF);

    expect(notifications.dispatchForCase).toHaveBeenCalledTimes(2);
    expect(notifications.dispatchForCase).toHaveBeenCalledWith(
      'case-1',
      NotificationEvent.INVITATION_RECEIVED,
      expect.any(Object),
    );
  });

  it('says nothing on a correction — the visa stage started once, not twice', async () => {
    const { service, notifications } = harness({ id: 'inv-1' });

    await service.recordInvitation('case-1', { number: 'INV-2' }, undefined, STAFF);

    expect(notifications.dispatchForCase).not.toHaveBeenCalled();
  });
});
