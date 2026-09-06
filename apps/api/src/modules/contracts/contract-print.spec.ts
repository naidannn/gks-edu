import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ContractStatus, ContractType } from '../../prisma/client.js';
import type { ContractPdfParams, ContractPdfService } from './contract-pdf.service.js';
import { CONTRACT_TITLE, ContractsService } from './contracts.service.js';

const SIGNED_AT = new Date('2026-09-04T07:30:00Z');

function contractRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'contract-1',
    number: 'СГ/26/007',
    type: ContractType.PHYSICAL,
    status: ContractStatus.DRAFT,
    bodyMn: '## 1. ЕРӨНХИЙ ЗҮЙЛ\n\n1.1 Гэрээний эх бие.',
    createdAt: new Date('2026-09-02T00:00:00Z'),
    signedAt: null,
    signedIp: null,
    ...overrides,
  };
}

/** The service under test only reaches prisma and the PDF renderer here. */
function subject(row: ReturnType<typeof contractRow> | null) {
  const render = vi.fn<(params: ContractPdfParams) => Promise<Buffer>>().mockResolvedValue(Buffer.from('%PDF-1.3'));
  const prisma = { contract: { findUnique: vi.fn().mockResolvedValue(row) } };

  const service = new ContractsService(
    prisma as unknown as PrismaService,
    null as never,
    null as never,
    { render } as unknown as ContractPdfService,
    null as never,
    null as never,
    null as never,
    null as never,
  );
  return { service, render };
}

describe('the printable contract (1C-25)', () => {
  it('renders the body frozen at issue, without touching storage', async () => {
    const { service, render } = subject(contractRow());

    const { buffer } = await service.renderPrintable('contract-1');

    expect(buffer.toString()).toBe('%PDF-1.3');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        title: CONTRACT_TITLE,
        number: 'СГ/26/007',
        bodyMn: '## 1. ЕРӨНХИЙ ЗҮЙЛ\n\n1.1 Гэрээний эх бие.',
      }),
    );
  });

  it('leaves the signature lines blank so the paper copy can be signed', async () => {
    const { service, render } = subject(contractRow());

    await service.renderPrintable('contract-1');

    expect(render.mock.calls[0]![0].signedAt).toBeNull();
  });

  // Stamping "цахимаар баталгаажсан" on a contract signed with a pen would be
  // a lie on paper — only an e-signed contract carries the audit line.
  it('stamps a signed electronic contract, never a signed physical one', async () => {
    const electronic = subject(
      contractRow({ type: ContractType.ELECTRONIC, status: ContractStatus.SIGNED, signedAt: SIGNED_AT, signedIp: '1.2.3.4' }),
    );
    await electronic.service.renderPrintable('contract-1');
    expect(electronic.render.mock.calls[0]![0]).toMatchObject({ signedAt: SIGNED_AT, signedIp: '1.2.3.4' });

    const physical = subject(contractRow({ status: ContractStatus.SIGNED, signedAt: SIGNED_AT }));
    await physical.service.renderPrintable('contract-1');
    expect(physical.render.mock.calls[0]![0].signedAt).toBeNull();
  });

  it('names the file by the contract number, with the slashes a filesystem rejects removed', async () => {
    const { service } = subject(contractRow());

    const { filename } = await service.renderPrintable('contract-1');

    expect(filename).toBe('Гэрээ-СГ-26-007.pdf');
  });

  it('404s on an unknown contract instead of rendering an empty sheet', async () => {
    const { service } = subject(null);

    await expect(service.renderPrintable('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
