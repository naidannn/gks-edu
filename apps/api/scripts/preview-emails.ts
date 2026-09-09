/**
 * Renders every outgoing email to disk so the design can be looked at without
 * sending anything.
 *
 *   pnpm email:preview [outDir]
 *
 * The notification mails are rendered from `NOTIFICATION_TEMPLATES` through the
 * same `render()` the dispatcher uses, and the transactional ones from the same
 * builders the services call — so what opens in the browser is what Resend
 * would send, not a mock-up of it.
 */

import 'reflect-metadata';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NotificationChannel } from '../src/generated/prisma/enums.js';
import { EMAIL_BRAND } from '../src/modules/notifications/email/email-brand.js';
import { renderEmail, type EmailMessage } from '../src/modules/notifications/email/email-template.js';
import { presentationFor } from '../src/modules/notifications/email/email-presentation.js';
import {
  accountClaimEmail,
  clientWelcomeEmail,
  contractSignOtpEmail,
  leadReceivedEmail,
  passwordChangedEmail,
  passwordResetEmail,
  passwordResetGoogleEmail,
} from '../src/modules/notifications/email/transactional.js';
import { NOTIFICATION_TEMPLATES } from '../src/modules/notifications/notification-templates.data.js';
import { render } from '../src/modules/notifications/notifications.service.js';

const APP_URL = process.env.APP_PUBLIC_URL ?? 'https://gksedu.mn';

/** One sample value per placeholder the templates use, in realistic shapes. */
const SAMPLE: Record<string, string> = {
  clientName: 'Батбаярын Тэмүүлэн',
  userEmail: 'temuulen@example.mn',
  caseId: '7f2a1c94-2b3d-4e51-9a80-6c1d2e3f4a5b',
  caseCode: 'GKS-2026-0148',
  documentName: 'Бүрэн дунд боловсролын гэрчилгээ',
  dueDate: '2026 оны 09 сарын 21',
  daysLeft: '5',
  missingCount: '3',
  missingList: '- Иргэний үнэмлэхний хуулбар\n- Банкны тодорхойлолт\n- Эцэг эхийн зөвшөөрөл',
  remainingCount: '4 материал',
  reason: 'Гэрчилгээний нотариатын баталгаа хугацаа хэтэрсэн байна.',
  serviceName: 'Бакалавр',
  contractNumber: 'GKS-C-2026-0311',
  paymentKindName: 'Урьдчилгаа төлбөр',
  amount: '1,200,000',
  paidAt: '2026 оны 09 сарын 05',
  universityName: 'Ажу их сургууль (Ajou University)',
  roundName: '1-р шат',
  decisionName: 'Тэнцсэн',
  resultNote: 'Хоёрдугаар шатны ярилцлага 09 сарын 18-нд болно.',
  requestedDocs: '- Санхүүгийн баталгаа (сүүлийн 3 сар)\n- Хэлний түвшний гэрчилгээ',
  invitationNumber: 'AJOU-2026-INV-0912',
  visaTypeName: 'D-2 (оюутны)',
  appointmentDate: '2026 оны 10 сарын 02',
  visaStatusName: 'Виз гарсан',
  expiryDate: '2027 оны 02 сарын 28',
  departureDate: '2026 оны 11 сарын 14',
  arrivalDate: '2026 оны 11 сарын 15',
  flightNumber: 'OM 501 (Улаанбаатар → Сөүл)',
  leadId: 'a13c9b70-55d2-4f18-b0e1-7c4e2a91d3f6',
  leadName: 'Дорж Сарантуяа',
  leadPhone: '9911-2233',
  leadEmail: 'sarantuya@example.mn',
  sourceName: 'Вэбсайт',
  interestedServices: 'Бакалавр, GKS тэтгэлэг',
  stageName: 'Зөвлөгөө өгсөн',
  nextContactDate: '2026 оны 09 сарын 08',
};

interface Preview {
  slug: string;
  group: string;
  label: string;
  message: EmailMessage;
}

function notificationPreviews(): Preview[] {
  return NOTIFICATION_TEMPLATES.filter((template) => template.channel === NotificationChannel.EMAIL).map(
    (template) => {
      const look = presentationFor(template.event);
      const link = template.linkMn ? `${APP_URL}${render(template.linkMn, SAMPLE)}` : null;

      return {
        slug: `notification-${template.event.toLowerCase()}`,
        group: 'Мэдэгдэл',
        label: template.event,
        message: {
          subject: render(template.titleMn, SAMPLE),
          eyebrow: look.eyebrow,
          tone: look.tone,
          body: render(template.bodyMn, { ...SAMPLE, link: link ?? '' }),
          cta: link ? { label: look.ctaLabel, url: link } : null,
        },
      };
    },
  );
}

function transactionalPreviews(): Preview[] {
  const url = (path: string) => `${APP_URL}${path}`;

  return [
    ['client-welcome', 'Тавтай морил + кабинет идэвхжүүлэх', clientWelcomeEmail({
      name: 'Батбаярын Тэмүүлэн',
      email: 'temuulen@example.mn',
      link: url('/claim?token=sample-token'),
      consultantName: 'Дорж Оюунчимэг',
    })],
    ['account-claim', 'Бүртгэл идэвхжүүлэх урилга (дахин илгээх)', accountClaimEmail({
      name: 'Батбаярын Тэмүүлэн',
      email: 'temuulen@example.mn',
      link: url('/claim?token=sample-token'),
    })],
    ['password-reset', 'Нууц үг сэргээх', passwordResetEmail({
      name: 'Батбаярын Тэмүүлэн',
      email: 'temuulen@example.mn',
      link: url('/reset-password?token=sample-token'),
    })],
    ['password-reset-google', 'Нууц үг сэргээх (Google данс)', passwordResetGoogleEmail({
      name: 'Батбаярын Тэмүүлэн',
      loginUrl: url('/login'),
    })],
    ['password-changed', 'Нууц үг шинэчлэгдсэн', passwordChangedEmail({
      name: 'Батбаярын Тэмүүлэн',
      loginUrl: url('/login'),
    })],
    ['contract-sign-otp', 'Гэрээ баталгаажуулах код', contractSignOtpEmail({
      name: 'Батбаярын Тэмүүлэн',
      code: '408217',
      contractNumber: 'СГ/26/001',
      totalAmount: '5,000,000',
      serviceName: 'БНСУ-ын Засгийн газрын тэтгэлэг (GKS)',
      minutes: 5,
    })],
    ['lead-received', 'Зөвлөгөөний хүсэлт хүлээн авсан', leadReceivedEmail({
      name: 'Дорж Сарантуяа',
      phone: '9911-2233',
      email: 'sarantuya@example.mn',
      services: ['Бакалавр', 'GKS тэтгэлэг'],
      universitiesUrl: url('/universities'),
    })],
  ].map(([slug, label, message]) => ({
    slug: slug as string,
    group: 'Транзакц',
    label: label as string,
    message: message as EmailMessage,
  }));
}

async function main(): Promise<void> {
  const outDir = resolve(process.argv[2] ?? 'tmp/email-preview');
  await mkdir(outDir, { recursive: true });

  const previews = [...transactionalPreviews(), ...notificationPreviews()];

  // The logo is hosted by the web app, which is not running here — point the
  // preview copies at a local file so the header renders. Nothing else in the
  // HTML is rewritten: the links stay the absolute ones production sends.
  await mkdir(join(outDir, 'img/brand'), { recursive: true });
  await copyFile(
    resolve(import.meta.dirname, '../../web/public', `.${EMAIL_BRAND.logoPath}`),
    join(outDir, EMAIL_BRAND.logoPath.replace(/^\//, '')),
  );

  for (const preview of previews) {
    const { html, text } = renderEmail(preview.message, APP_URL);
    const local = html.replace(`${APP_URL}${EMAIL_BRAND.logoPath}`, `.${EMAIL_BRAND.logoPath}`);
    await writeFile(join(outDir, `${preview.slug}.html`), local, 'utf8');
    await writeFile(join(outDir, `${preview.slug}.txt`), text, 'utf8');
  }

  await writeFile(join(outDir, 'index.html'), indexPage(previews), 'utf8');

  console.log(`${previews.length} имэйл → ${outDir}`);
  console.log(`Нээх: open ${join(outDir, 'index.html')}`);
}

/** A contact sheet: every email in its own frame, so the set is judged together. */
function indexPage(previews: Preview[]): string {
  const groups = [...new Set(previews.map((preview) => preview.group))];

  const section = (group: string) => `
    <h2>${group}</h2>
    <div class="grid">
      ${previews
        .filter((preview) => preview.group === group)
        .map(
          (preview) => `<figure>
        <figcaption><a href="${preview.slug}.html" target="_blank">${preview.label}</a>
        <span>${preview.message.subject.replace(/</g, '&lt;')}</span></figcaption>
        <iframe src="${preview.slug}.html" loading="lazy"></iframe>
      </figure>`,
        )
        .join('\n')}
    </div>`;

  return `<!doctype html><html lang="mn"><head><meta charset="utf-8">
<title>GKSedu — имэйлийн загварууд</title>
<style>
  body { margin: 0; padding: 32px; background: #eaedf1; font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #141a21; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.lede { margin: 0 0 28px; color: #5a6673; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #5a6673; margin: 32px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
  figure { margin: 0; background: #fff; border: 1px solid #dce1e7; border-radius: 12px; overflow: hidden; }
  figcaption { padding: 10px 14px; border-bottom: 1px solid #eaedf1; display: flex; flex-direction: column; gap: 2px; }
  figcaption a { font-weight: 600; color: #1d4ed8; text-decoration: none; font-size: 13px; }
  figcaption span { color: #75818f; font-size: 12px; }
  iframe { width: 100%; height: 560px; border: 0; display: block; background: #f4f6f8; }
</style></head><body>
<h1>GKSedu.mn — имэйлийн загварууд</h1>
<p class="lede">${previews.length} загвар. Хүрээ бүр бодит рендер — илгээгдэх HTML яг ийм харагдана.</p>
${groups.map(section).join('\n')}
</body></html>`;
}

await main();
