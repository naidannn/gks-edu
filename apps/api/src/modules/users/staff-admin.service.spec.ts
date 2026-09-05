import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CacheService } from '../../redis/cache.service.js';
import { UsersService } from './users.service.js';

/**
 * 1G-12 — the guards on the system-user register. Everything here is about the
 * two ways an admin can wreck the system from this one screen: locking the last
 * admin out, and erasing an account whose name is on the record.
 */

const NO_TRACE = {
  assignedLeads: 0,
  assignedCasesAsConsultant: 0,
  assignedCasesAsDocOfficer: 0,
  leads: 0,
  leadActivities: 0,
  assignedClients: 0,
  createdClients: 0,
  cases: 0,
  caseTransitions: 0,
  contracts: 0,
  payments: 0,
  documentFiles: 0,
  documentReviewNotes: 0,
  assignedWorkTasks: 0,
  createdWorkTasks: 0,
  applicationResults: 0,
  invitations: 0,
  officeAppointments: 0,
  documents: 0,
  posts: 0,
  auditLogs: 0,
};

function serviceWith(target: Record<string, unknown> | null, activeAdmins = 2) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(target),
      count: vi.fn().mockResolvedValue(activeAdmins),
      create: vi.fn().mockResolvedValue({ id: 'staff-1' }),
      update: vi.fn().mockResolvedValue({ id: 'staff-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'staff-1' }),
    },
    refreshToken: { updateMany: vi.fn() },
  };
  const cache = { del: vi.fn() } as unknown as CacheService;
  return {
    prisma,
    service: new UsersService(prisma as unknown as PrismaService, cache),
  };
}

describe('UsersService.updateStaff (1G-12)', () => {
  it('refuses to demote the last active admin', async () => {
    const { service } = serviceWith({ role: Role.ADMIN }, 1);
    await expect(service.updateStaff('staff-1', { role: Role.CONSULTANT }, 'admin-2')).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses to let an admin drop their own admin rights, even with others left', async () => {
    const { service } = serviceWith({ role: Role.ADMIN }, 3);
    await expect(service.updateStaff('staff-1', { isActive: false }, 'staff-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('demotes an admin while another active admin remains', async () => {
    const { service, prisma } = serviceWith({ role: Role.ADMIN }, 2);
    await service.updateStaff('staff-1', { role: Role.CONSULTANT }, 'admin-2');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: Role.CONSULTANT }) }),
    );
  });

  it('leaves clients alone — this register is staff only', async () => {
    const { service } = serviceWith({ role: Role.USER });
    await expect(service.updateStaff('client-1', { name: 'Шинэ нэр' }, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('normalises a changed email and rejects one already taken', async () => {
    const { service, prisma } = serviceWith({ role: Role.CONSULTANT });
    prisma.user.findUnique
      .mockResolvedValueOnce({ role: Role.CONSULTANT })
      .mockResolvedValueOnce({ id: 'someone-else' });
    await expect(service.updateStaff('staff-1', { email: ' Taken@GKS.mn ' }, 'admin-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { email: 'taken@gks.mn' } }),
    );
  });
});

describe('UsersService.deleteStaff (1G-12)', () => {
  it('erases an account that never did anything', async () => {
    const { service, prisma } = serviceWith({ role: Role.CONSULTANT, isActive: true, _count: NO_TRACE });
    await service.deleteStaff('staff-1', 'admin-1');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'staff-1' } });
  });

  it('refuses once the account is named anywhere in the record', async () => {
    const { service, prisma } = serviceWith({
      role: Role.CONSULTANT,
      isActive: false,
      _count: { ...NO_TRACE, contracts: 3 },
    });
    await expect(service.deleteStaff('staff-1', 'admin-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the caller', async () => {
    const { service, prisma } = serviceWith({ role: Role.ADMIN, isActive: true, _count: NO_TRACE });
    await expect(service.deleteStaff('admin-1', 'admin-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the last active admin', async () => {
    const { service } = serviceWith({ role: Role.ADMIN, isActive: true, _count: NO_TRACE }, 1);
    await expect(service.deleteStaff('staff-1', 'admin-2')).rejects.toThrow(ConflictException);
  });
});

describe('UsersService.createStaff (1G-12)', () => {
  it('hashes a password the admin typed and counts the account as claimed', async () => {
    const { service, prisma } = serviceWith(null);
    await service.createStaff({
      email: 'Shine@GKS.mn',
      name: ' Шинэ ажилтан ',
      role: Role.CONSULTANT,
      password: 'plain-password',
    });

    const written = prisma.user.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(written.email).toBe('shine@gks.mn');
    expect(written.name).toBe('Шинэ ажилтан');
    expect(written.password).toEqual(expect.any(String));
    expect(written.password).not.toBe('plain-password');
    expect(written.claimedAt).toBeInstanceOf(Date);
  });

  it('leaves the row password-less when the admin wants the invitation flow', async () => {
    const { service, prisma } = serviceWith(null);
    await service.createStaff({ email: 'shine@gks.mn', name: 'Шинэ', role: Role.DOC_OFFICER });

    const written = prisma.user.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(written).not.toHaveProperty('password');
    expect(written).not.toHaveProperty('claimedAt');
  });
});

describe('UsersService.setStaffPassword (1G-12)', () => {
  it('sets the password, spends the invitation and revokes every session', async () => {
    const { service, prisma } = serviceWith({ role: Role.CONSULTANT, claimedAt: null });
    await service.setStaffPassword('staff-1', 'plain-password', 'admin-1');

    const written = prisma.user.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(written.password).not.toBe('plain-password');
    expect(written.claimTokenHash).toBeNull();
    expect(written.claimedAt).toBeInstanceOf(Date);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'staff-1', revokedAt: null } }),
    );
  });

  it('keeps the original claim date once the account has one', async () => {
    const claimedAt = new Date('2026-01-15T00:00:00Z');
    const { service, prisma } = serviceWith({ role: Role.ADMIN, claimedAt });
    await service.setStaffPassword('staff-1', 'plain-password', 'admin-1');
    expect((prisma.user.update.mock.calls[0]![0].data as Record<string, unknown>).claimedAt).toBe(claimedAt);
  });

  it('sends an admin re-keying their own account to /auth/password/change', async () => {
    const { service, prisma } = serviceWith({ role: Role.ADMIN, claimedAt: null });
    await expect(service.setStaffPassword('admin-1', 'plain-password', 'admin-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('leaves clients alone — this register is staff only', async () => {
    const { service } = serviceWith({ role: Role.USER, claimedAt: null });
    await expect(service.setStaffPassword('client-1', 'plain-password', 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
