import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CaseStage, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from './cases.service.js';

/** Minimal Prisma double for the transition engine (1C-03, 1C-15's system-transition hook). */
function prismaStub(overrides: {
  gksCase?: Record<string, unknown>;
  flowRule?: Record<string, unknown> | null;
} = {}) {
  const found = overrides.gksCase ?? {
    id: 'case-1',
    serviceType: ServiceType.LANGUAGE_PREP,
    stage: CaseStage.CONTRACT_DRAFT,
  };

  const prisma = {
    case: {
      findUnique: vi.fn().mockResolvedValue(found),
      update: vi.fn().mockResolvedValue({ ...found, stage: 'updated' }),
    },
    caseFlowDefinition: {
      findUnique: vi.fn().mockResolvedValue(overrides.flowRule === undefined ? null : overrides.flowRule),
    },
    caseTransition: {
      create: vi.fn().mockResolvedValue({ id: 'transition-1' }),
    },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

const consultant: AuthenticatedUser = { id: 'staff-1', email: 'c@gks.edu', role: Role.CONSULTANT };

describe('CasesService.transition (1C-03)', () => {
  it('applies a manually-allowed transition and logs it under the acting staff member', async () => {
    const prisma = prismaStub({
      flowRule: { allowedRoles: [Role.ADMIN, Role.CONSULTANT], isSystemOnly: false },
    });
    const service = new CasesService(prisma);

    await service.transition('case-1', { toStage: CaseStage.ON_HOLD }, consultant);

    expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { stage: CaseStage.ON_HOLD } });
    expect(prisma.caseTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ caseId: 'case-1', toStage: CaseStage.ON_HOLD, actorId: 'staff-1' }),
    });
  });

  it('rejects a stage with no CaseFlowDefinition row', async () => {
    const prisma = prismaStub({ flowRule: null });
    const service = new CasesService(prisma);

    await expect(service.transition('case-1', { toStage: CaseStage.COMPLETED }, consultant)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('rejects a system-only edge even for an admin — payment/contract signing must drive it', async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [], isSystemOnly: true } });
    const service = new CasesService(prisma);

    await expect(
      service.transition('case-1', { toStage: CaseStage.PREPAYMENT_PAID }, consultant),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it("rejects a role that isn't in the rule's allowedRoles", async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [Role.ADMIN], isSystemOnly: false } });
    const service = new CasesService(prisma);

    await expect(service.transition('case-1', { toStage: CaseStage.ON_HOLD }, consultant)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('CasesService.applySystemTransition (1C-15)', () => {
  it('advances the case when a matching isSystemOnly rule exists', async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [], isSystemOnly: true } });
    const service = new CasesService(prisma);

    await service.applySystemTransition(prisma, 'case-1', CaseStage.PREPAYMENT_PAID);

    expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { stage: CaseStage.PREPAYMENT_PAID } });
    expect(prisma.caseTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: null, toStage: CaseStage.PREPAYMENT_PAID }),
    });
  });

  it('refuses to run when the target is not flagged isSystemOnly (prevents bypassing manual role checks)', async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [Role.ADMIN], isSystemOnly: false } });
    const service = new CasesService(prisma);

    await expect(service.applySystemTransition(prisma, 'case-1', CaseStage.ON_HOLD)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.case.update).not.toHaveBeenCalled();
  });
});
