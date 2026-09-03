import { describe, expect, it, vi } from 'vitest';
import { LeadActivityType, LeadSource } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LeadsService, normalizePhone } from './leads.service.js';
import type { CreatePublicLeadDto } from './dto/create-public-lead.dto.js';

/** Minimal Prisma double — only the calls the public-form path makes. */
function prismaStub(overrides: { recentLead?: { id: string } | null } = {}) {
  const prisma = {
    lead: {
      findFirst: vi.fn().mockResolvedValue(overrides.recentLead ?? null),
      create: vi.fn().mockResolvedValue({ id: 'new-lead' }),
    },
    leadActivity: { create: vi.fn().mockResolvedValue({ id: 'activity' }) },
    university: { findMany: vi.fn().mockResolvedValue([{ id: 'uni-1' }]) },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

const base: CreatePublicLeadDto = {
  lastName: 'Батбаяр',
  firstName: 'Тэмүүлэн',
  phone: '99112233',
};

describe('normalizePhone', () => {
  it.each([
    ['9911-2233', '99112233'],
    ['+976 9911 2233', '99112233'],
    ['(976) 9911-2233', '99112233'],
    ['99112233', '99112233'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('LeadsService.createFromPublicForm', () => {
  it('creates a lead with an opening activity', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma);

    const result = await service.createFromPublicForm({
      ...base,
      phone: '+976 9911-2233',
      email: 'Test@Example.com ',
      interestedUniversitySlugs: ['ajou-university'],
    });

    expect(result.merged).toBe(false);
    const data = prisma.lead.create.mock.calls[0]![0].data;
    expect(data.phone).toBe('99112233');
    expect(data.email).toBe('test@example.com');
    expect(data.source).toBe(LeadSource.WEBSITE);
    expect(data.interestedUniversityIds).toEqual(['uni-1']);
    expect(data.activities.create.type).toBe(LeadActivityType.NOTE);
  });

  it('drops honeypot submissions without writing anything', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma);

    const result = await service.createFromPublicForm({ ...base, website: 'http://spam.example' });

    expect(result.merged).toBe(false);
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });

  it('merges a repeat submission from the same number into the existing lead', async () => {
    const prisma = prismaStub({ recentLead: { id: 'existing-lead' } });
    const service = new LeadsService(prisma);

    const result = await service.createFromPublicForm({ ...base, note: 'Дахин холбогдлоо' });

    expect(result).toEqual({ id: 'existing-lead', merged: true });
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: 'existing-lead', body: 'Дахин холбогдлоо' }),
    });
  });
});
