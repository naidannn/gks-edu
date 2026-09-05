import { describe, expect, it } from 'vitest';
import { amountInWordsMnCapitalized } from './amount-words.util.js';
import { CONTRACT_BODY_TEMPLATE } from './contract-body.template.js';
import { BALANCE_CONDITION, formatSignatureDate, partyTokens } from './contracts.service.js';
import { formatAmountExact, renderContractBody } from './contract-template.util.js';
import { BalanceTrigger } from '../../prisma/client.js';

const CLIENT = {
  lastName: 'Баяндалай',
  firstName: 'Зориг',
  registerNumber: 'НК03232418',
  birthDate: new Date('2004-03-23'),
  phone: '89807061',
  email: 'zorig@example.mn',
  address: 'УБ, Хан-Уул, 9-р хороо',
  guardianLastName: 'Дорж',
  guardianFirstName: 'Сараа',
  guardianRegisterNumber: 'УБ98010112',
  guardianRelation: 'Эх',
};
const USER = { name: 'Зориг', email: 'zorig@example.mn', phone: '89807061' };

const TOTAL = 5_000_000;
const PREPAYMENT = 1_500_000;

function render(byGuardian = false): string {
  return renderContractBody(CONTRACT_BODY_TEMPLATE, {
    ...partyTokens(USER, CLIENT, byGuardian),
    contractDate: '2026-09-02',
    signatureDate: formatSignatureDate(new Date(2026, 8, 2)),
    universityName: 'Сөүлийн Их Сургууль',
    totalAmount: formatAmountExact(TOTAL),
    totalAmountWords: amountInWordsMnCapitalized(TOTAL),
    prepaymentAmount: formatAmountExact(PREPAYMENT),
    prepaymentAmountWords: amountInWordsMnCapitalized(PREPAYMENT),
    balanceAmount: formatAmountExact(TOTAL - PREPAYMENT),
    balanceAmountWords: amountInWordsMnCapitalized(TOTAL - PREPAYMENT),
    balanceCondition: BALANCE_CONDITION[BalanceTrigger.AFTER_SCHOLARSHIP_RESULT],
  });
}

describe('the shipped contract template', () => {
  it('leaves no placeholder behind — every token the body uses is supplied', () => {
    expect(render()).not.toMatch(/\{\{\w+\}\}/);
  });

  it('writes the money the way the signed Word file writes it', () => {
    const body = render();
    expect(body).toContain('5,000,000.00 (Таван сая төгрөг)');
    expect(body).toContain('1,500,000.00 (Нэг сая таван зуун мянга) төгрөгийг');
    expect(body).toContain('3,500,000.00 (Гурван сая таван зуун мянга)');
  });

  it('names the balance trigger from configuration, never from a constant', () => {
    expect(render()).toContain('тэтгэлэгт тэнцсэн тухай мэдэгдэл ирмэгц');
    const afterVisa = renderContractBody('{{balanceCondition}}', {
      balanceCondition: BALANCE_CONDITION[BalanceTrigger.AFTER_VISA_APPROVED],
    });
    expect(afterVisa).toContain('виз олгогдсоны дараа');
  });

  it('names the guardian beside a minor, and no one beside an adult', () => {
    expect(render(false)).toContain('/РД: НК03232418/ (цаашид “Зуучлуулагч” гэх)');
    expect(render(true)).toContain('түүний өмнөөс хууль ёсны төлөөлөгч Дорж Сараа /РД: УБ98010112, Эх/');
  });

  it('fills both signature columns from the client record', () => {
    const body = render();
    expect(body).toContain('Овог, нэр: Б.Зориг');
    expect(body).toContain('Огноо: 2026/09/02');
  });
});
