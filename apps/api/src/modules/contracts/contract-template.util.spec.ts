import { describe, expect, it } from 'vitest';
import { formatAmount, formatAmountExact, renderContractBody } from './contract-template.util.js';

describe('formatAmount', () => {
  it('groups thousands', () => {
    expect(formatAmount(1200000)).toBe('1,200,000');
    expect(formatAmount('200000')).toBe('200,000');
  });

  it('accepts Prisma.Decimal-like values (anything with toString)', () => {
    expect(formatAmount({ toString: () => '3500000' })).toBe('3,500,000');
  });
});

describe('renderContractBody', () => {
  it('substitutes known placeholders', () => {
    const result = renderContractBody('Хэрэглэгч: {{userName}}, дүн: {{totalAmount}}₮', {
      userName: 'Бат',
      totalAmount: '1,200,000',
    });
    expect(result).toBe('Хэрэглэгч: Бат, дүн: 1,200,000₮');
  });

  it('leaves unresolved tokens as-is (admin still needs to fill them in)', () => {
    const result = renderContractBody('Нөхцөл: {{refundTerms}}', {});
    expect(result).toBe('Нөхцөл: {{refundTerms}}');
  });
});

describe('formatAmountExact', () => {
  it('keeps the two decimals the contract prints', () => {
    expect(formatAmountExact(5_000_000)).toBe('5,000,000.00');
    expect(formatAmountExact('1500000')).toBe('1,500,000.00');
    expect(formatAmountExact(1_234.5)).toBe('1,234.50');
  });
});
