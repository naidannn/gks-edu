/**
 * Dev-only maintenance script: wipes every client and everything that hangs
 * off one, so the development database can be re-seeded from a clean slate.
 *
 *   pnpm exec tsx prisma/purge-clients.ts            # dry run, reports only
 *   pnpm exec tsx prisma/purge-clients.ts --commit   # backs up, then deletes
 *
 * What goes:
 *  - every `Case` and its cascade (contracts, payments, documents, files,
 *    applications, invoices, invitations, visa, departure, appointments, tasks)
 *  - every `Client` and the `User` row behind it — including its login
 *  - every `Lead`, `Conversation`, `Notification` and `AuditLog`
 *  - the uploaded files under `storage/cases`
 *
 * What stays: staff accounts, the seed logins (`student@gks.edu` keeps its
 * account but loses its demo cases), site visitors who never became a client,
 * and all reference data — universities, faculties, programmes, intakes,
 * templates, pricing, posts, FAQ.
 *
 * Refuses to run against anything but a development database.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const commit = process.argv.includes('--commit');
const url = process.env.DATABASE_URL ?? '';

// The production database lives on the EC2 box itself (deploy/.env.production);
// a loopback host is the one thing this script must never touch.
if (/@(127\.0\.0\.1|localhost)/.test(url) && process.env.NODE_ENV === 'production') {
  console.error('Үйлдвэрлэлийн (production) DB — зогсоолоо.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const counts = async () => {
  const [
    users, clients, leads, cases, contracts, payments, caseDocuments,
    documentFiles, applications, invitations, visas, departures,
    conversations, messages, notifications, auditLogs, schoolInvoices,
  ] = await Promise.all([
    prisma.user.count(), prisma.client.count(), prisma.lead.count(),
    prisma.case.count(), prisma.contract.count(), prisma.payment.count(),
    prisma.caseDocument.count(), prisma.documentFile.count(),
    prisma.application.count(), prisma.invitation.count(),
    prisma.visaCase.count(), prisma.departurePlan.count(),
    prisma.conversation.count(), prisma.message.count(),
    prisma.notification.count(), prisma.auditLog.count(),
    prisma.schoolInvoice.count(),
  ]);
  return {
    users, clients, leads, cases, contracts, payments, caseDocuments,
    documentFiles, applications, invitations, visas, departures,
    conversations, messages, notifications, auditLogs, schoolInvoices,
  };
};

const before = await counts();
console.log('DB:', url.replace(/^.*@/, '').replace(/\?.*$/, ''));
console.log('\n── Өмнө ──');
console.table(before);

const clientUserIds = (await prisma.client.findMany({ select: { userId: true } })).map((c) => c.userId);
const doomedUsers = await prisma.user.findMany({
  where: { id: { in: clientUserIds } },
  select: { id: true, email: true, name: true, role: true },
});

console.log('\n── Устах хэрэглэгчид ──');
console.table(doomedUsers.map((u) => ({ email: u.email ?? '— (login аваагүй)', name: u.name, role: u.role })));

if (!commit) {
  console.log('\nЭнэ бол хуурай гүйлт. Бодитоор устгахад --commit нэмнэ үү.');
  await prisma.$disconnect();
  process.exit(0);
}

// ── Backup ─────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(process.cwd(), '..', '..', '.backups', `purge-clients-${stamp}`);
await mkdir(backupDir, { recursive: true });

const dump = async (name: string, rows: unknown) => {
  await writeFile(join(backupDir, `${name}.json`), JSON.stringify(rows, null, 2));
};

await Promise.all([
  dump('users', doomedUsers),
  dump('clients', await prisma.client.findMany()),
  dump('leads', await prisma.lead.findMany()),
  dump('lead-activities', await prisma.leadActivity.findMany()),
  dump('cases', await prisma.case.findMany()),
  dump('case-university-choices', await prisma.caseUniversityChoice.findMany()),
  dump('case-transitions', await prisma.caseTransition.findMany()),
  dump('case-conditions', await prisma.caseConditions.findMany()),
  dump('contracts', await prisma.contract.findMany()),
  dump('collateral-contracts', await prisma.collateralContract.findMany()),
  dump('payments', await prisma.payment.findMany()),
  dump('case-documents', await prisma.caseDocument.findMany()),
  dump('document-files', await prisma.documentFile.findMany()),
  dump('document-review-notes', await prisma.documentReviewNote.findMany()),
  dump('work-tasks', await prisma.workTask.findMany()),
  dump('office-appointments', await prisma.officeAppointment.findMany()),
  dump('applications', await prisma.application.findMany()),
  dump('application-results', await prisma.applicationResult.findMany()),
  dump('school-invoices', await prisma.schoolInvoice.findMany()),
  dump('school-invoice-items', await prisma.schoolInvoiceItem.findMany()),
  dump('invitations', await prisma.invitation.findMany()),
  dump('visa-cases', await prisma.visaCase.findMany()),
  dump('departure-plans', await prisma.departurePlan.findMany()),
  dump('departure-checklist-items', await prisma.departureChecklistItem.findMany()),
  dump('conversations', await prisma.conversation.findMany()),
  dump('messages', await prisma.message.findMany()),
  dump('notifications', await prisma.notification.findMany()),
  dump('notification-preferences', await prisma.notificationPreference.findMany()),
  dump('saved-universities', await prisma.savedUniversity.findMany()),
  dump('audit-logs', await prisma.auditLog.findMany()),
]);
console.log('\nНөөц:', backupDir);

// ── Delete ─────────────────────────────────────────────────────────────────
// Order matters: `Case.user` and `Contract.user` are `onDelete: Restrict`, so
// the cases have to go before the users they belong to. Everything hanging off
// a case (contracts, payments, documents, applications, visa, departure …)
// cascades, so deleting the case row is enough.
const steps: [string, () => Promise<{ count: number }>][] = [
  ['messages', () => prisma.message.deleteMany({})],
  ['conversations', () => prisma.conversation.deleteMany({})],
  ['cases (+ бүх дэд бичлэг)', () => prisma.case.deleteMany({})],
  ['lead activities', () => prisma.leadActivity.deleteMany({})],
  ['leads', () => prisma.lead.deleteMany({})],
  ['notifications', () => prisma.notification.deleteMany({})],
  ['audit logs', () => prisma.auditLog.deleteMany({})],
  ['clients + users', () => prisma.user.deleteMany({ where: { id: { in: clientUserIds } } })],
];

console.log('\n── Устгаж байна ──');
for (const [label, run] of steps) {
  const { count } = await run();
  console.log(`  ${label}: ${count}`);
}

await rm(join(process.cwd(), 'storage', 'cases'), { recursive: true, force: true });
console.log('  storage/cases: устлаа');

console.log('\n── Дараа ──');
console.table(await counts());
await prisma.$disconnect();
