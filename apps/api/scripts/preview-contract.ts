/**
 * Renders the shipped contract template to a PDF with sample data, so the
 * layout can be checked without issuing a real contract.
 *
 *   pnpm contract:preview [outfile.pdf]
 */
import { writeFileSync } from 'node:fs';
import { amountInWordsMnCapitalized } from '../src/modules/contracts/amount-words.util.js';
import { CONTRACT_BODY_TEMPLATE } from '../src/modules/contracts/contract-body.template.js';
import { ContractPdfService } from '../src/modules/contracts/contract-pdf.service.js';
import { formatAmountExact, renderContractBody } from '../src/modules/contracts/contract-template.util.js';

const TOTAL = 5_000_000;
const PREPAYMENT = 1_500_000;
const BALANCE = TOTAL - PREPAYMENT;

const bodyMn = renderContractBody(CONTRACT_BODY_TEMPLATE, {
  userLastName: 'Баяндалай',
  userFirstName: 'Зориг',
  userShortName: 'Б.Зориг',
  userRegister: 'НК03232418',
  userPhone: '89807061, 60630333',
  userEmail: 'bayndalaizorig@gmail.com',
  userAddress: 'УБ, Хан-Уул, 9-р хороо бурхант 10 гудамж 116 тоот',
  guardianNote: '',
  signatureDate: '2026/09/02',
  totalAmount: formatAmountExact(TOTAL),
  totalAmountWords: amountInWordsMnCapitalized(TOTAL),
  prepaymentAmount: formatAmountExact(PREPAYMENT),
  prepaymentAmountWords: amountInWordsMnCapitalized(PREPAYMENT),
  balanceAmount: formatAmountExact(BALANCE),
  balanceAmountWords: amountInWordsMnCapitalized(BALANCE),
  balanceCondition:
    'БНСУ-ын Засгийн газрын тэтгэлэгт хөтөлбөрийн албан ёсны үр дүн зарлагдаж, Зуучлуулагч тэтгэлэгт тэнцсэн тухай мэдэгдэл ирмэгц Зуучлагч тал энэ талаар Зуучлуулагчид боломжит богино хугацаанд мэдэгдэх бөгөөд үүний үндсэн дээр Зуучлуулагч нь үлдэгдэл төлбөрийг төлнө',
});

const out = process.argv[2] ?? 'contract-preview.pdf';
const pdf = await new ContractPdfService().render({
  title: 'СУРГАЛТ ЗУУЧЛАЛЫН ГЭРЭЭ',
  subtitle: 'EDUCATIONAL MEDIATION AGREEMENT',
  number: 'СГ/26/001',
  contractDate: new Date(2026, 8, 2),
  bodyMn,
  signedAt: new Date(2026, 8, 2, 9, 14, 0),
  signedIp: '203.0.113.24',
});
writeFileSync(out, pdf);
console.log(`${out} — ${(pdf.length / 1024).toFixed(0)} KB`);
