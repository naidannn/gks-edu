import { DocStage, DocumentStatus, Necessity } from '../../prisma/client.js';

/**
 * Mongolian labels for the document enums, on the server side.
 *
 * CLAUDE.md keeps enum labels in one place on the frontend, and that stays
 * true for the screens. A printed checklist (1D-21) never passes through the
 * browser, though — the PDF is rendered here — so the sheet needs its own copy,
 * the same way `notification-labels.ts` needs one for outgoing mail.
 */

export const DOC_STAGE_LABELS: Record<DocStage, string> = {
  [DocStage.ADMISSION]: 'Элсэлтийн материал',
  [DocStage.VISA]: 'Визний материал',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.NOT_STARTED]: 'Бүрдүүлээгүй',
  [DocumentStatus.IN_PROGRESS]: 'Бүрдүүлж байгаа',
  [DocumentStatus.SUBMITTED]: 'Илгээсэн',
  [DocumentStatus.UNDER_REVIEW]: 'Шалгаж байна',
  [DocumentStatus.NEEDS_FIX]: 'Засвар шаардлагатай',
  [DocumentStatus.RESUBMIT_REQUIRED]: 'Дахин илгээх',
  [DocumentStatus.ACCEPTED]: 'Хүлээн авсан',
  [DocumentStatus.IN_TRANSLATION]: 'Орчуулгад орсон',
  [DocumentStatus.TRANSLATED]: 'Орчуулсан',
  [DocumentStatus.CERTIFIED]: 'Баталгаажуулсан',
  [DocumentStatus.READY]: 'Бэлэн болсон',
  [DocumentStatus.SENT_TO_UNIVERSITY]: 'Сургуульд илгээсэн',
};

export const NECESSITY_LABELS: Record<Necessity, string> = {
  [Necessity.REQUIRED]: 'Заавал',
  [Necessity.CONDITIONAL]: 'Нөхцөлт',
  [Necessity.OPTIONAL]: 'Сонголтоор',
};
