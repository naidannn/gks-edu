import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../prisma/client.js';
import { ReportMailService } from './report-mail.service.js';
import type { PeopleReport } from './report-types.js';

/**
 * The mail carries names and phone numbers, so the property that matters is
 * where it can go: only to the active admin and consultant accounts that were
 * picked, one message each, with the workbooks attached — and a failed address
 * does not stop the others.
 */

const report: PeopleReport = {
  period: {
    preset: 'month',
    from: '2026-11-01',
    to: '2026-12-01',
    previousFrom: '2026-10-01',
    previousTo: '2026-11-01',
    labelMn: '2026 оны 11 сар',
    generatedAt: '2026-11-20T03:00:00.000Z',
  },
  clients: [],
  requested: [],
  consulted: [],
};

const sender = { id: 'sender', email: 'admin@gksedu.mn', role: Role.ADMIN };

function setup(found: { id: string; email: string }[]) {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue(found),
      findUnique: vi.fn().mockResolvedValue({ name: 'Админ', email: sender.email }),
    },
  };
  const reports = { peopleReport: vi.fn().mockResolvedValue(report) };
  const email = {
    send: vi.fn().mockResolvedValue(undefined),
    link: (path: string) => `https://gksedu.mn${path}`,
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ReportMailService(prisma as never, reports as never, email as never, audit as never);
  return { service, prisma, email, audit };
}

describe('ReportMailService.send', () => {
  it('asks only for active admins and consultants with an address', async () => {
    const { service, prisma } = setup([{ id: 'a', email: 'a@gksedu.mn' }]);
    await service.send({ preset: 'month' }, ['clients'], ['a'], sender);

    const where = prisma.user.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      id: { in: ['a'] },
      isActive: true,
      role: { in: [Role.ADMIN, Role.CONSULTANT] },
      email: { not: null },
    });
  });

  it('refuses the whole send when any picked id is not such an account', async () => {
    const { service, email } = setup([{ id: 'a', email: 'a@gksedu.mn' }]);
    await expect(service.send({ preset: 'month' }, ['clients'], ['a', 'client-user'], sender)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(email.send).not.toHaveBeenCalled();
  });

  it('sends one message per recipient with every chosen workbook attached', async () => {
    const { service, email, audit } = setup([
      { id: 'a', email: 'a@gksedu.mn' },
      { id: 'b', email: 'b@gksedu.mn' },
    ]);
    const result = await service.send({ preset: 'month' }, ['clients', 'consultations'], ['a', 'b', 'a'], sender);

    expect(result).toEqual({ sent: ['a@gksedu.mn', 'b@gksedu.mn'], failed: [] });
    expect(email.send).toHaveBeenCalledTimes(2);
    const [, message, , attachments] = email.send.mock.calls[0]!;
    expect(message.subject).toBe(
      'Тайлан: Үйлчлүүлэгч болсон хүмүүс ба Зөвлөгөө хүссэн, авсан хүмүүс — 2026 оны 11 сар',
    );
    expect(attachments.map((file: { filename: string }) => file.filename)).toEqual([
      'uilchluulegch-2026-11-01-2026-11-30.xlsx',
      'zuvluguu-2026-11-01-2026-11-30.xlsx',
    ]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'report.email', actorId: 'sender' }));
  });

  it('reports a failed address and still sends to the rest', async () => {
    const { service, email } = setup([
      { id: 'a', email: 'a@gksedu.mn' },
      { id: 'b', email: 'b@gksedu.mn' },
    ]);
    email.send.mockRejectedValueOnce(new Error('Resend 422'));

    const result = await service.send({ preset: 'month' }, ['clients'], ['a', 'b'], sender);
    expect(result.sent).toEqual(['b@gksedu.mn']);
    expect(result.failed).toEqual([{ email: 'a@gksedu.mn', error: 'Resend 422' }]);
  });
});
