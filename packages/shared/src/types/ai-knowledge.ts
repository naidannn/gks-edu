/**
 * AI knowledge-base payloads — 2A.
 *
 * Enums mirror the Prisma ones as string unions so the web app never imports
 * the generated client, the same arrangement as `messenger.ts`.
 */

/**
 * Who may read a piece of knowledge. Ordered: a caller sees their own level and
 * every level below it. `CONTRACTED` is not a role — it is "holds a contract in
 * force", which arrives and lapses on its own (AI-ASSISTANT.md §4.5).
 */
export type AccessLevel = 'PUBLIC' | 'REGISTERED' | 'CONTRACTED' | 'INTERNAL';

export type KnowledgeKind = 'FILE' | 'FAQ' | 'POST' | 'ENTRY' | 'PLAYBOOK';

export type KnowledgeCategory =
  | 'SCHOOL'
  | 'SERVICE'
  | 'PRICING'
  | 'SCHOLARSHIP'
  | 'DOCUMENTS'
  | 'VISA'
  | 'LIVING'
  | 'POLICY'
  | 'SALES'
  | 'FAQ';

export type KnowledgeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  PUBLIC: 'Нийтэд',
  REGISTERED: 'Бүртгэлтэй',
  CONTRACTED: 'Гэрээтэй',
  INTERNAL: 'Дотоод',
};

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKind, string> = {
  FILE: 'Файл',
  FAQ: 'Түгээмэл асуулт',
  POST: 'Нийтлэл',
  ENTRY: 'Хариултын карт',
  PLAYBOOK: 'Борлуулалтын заавар',
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  SCHOOL: 'Сургууль',
  SERVICE: 'Үйлчилгээ',
  PRICING: 'Үнэ, төлбөр',
  SCHOLARSHIP: 'Тэтгэлэг',
  DOCUMENTS: 'Материал',
  VISA: 'Виз',
  LIVING: 'Амьдрал',
  POLICY: 'Журам',
  SALES: 'Борлуулалт',
  FAQ: 'Түгээмэл асуулт',
};

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  DRAFT: 'Ноорог',
  PUBLISHED: 'Нийтлэгдсэн',
  ARCHIVED: 'Архивласан',
};

interface NamedRef {
  id: string;
  name: string | null;
}

/** A knowledge document as the admin list shows it. */
export interface KnowledgeDocumentListItem {
  id: string;
  title: string;
  kind: KnowledgeKind;
  category: KnowledgeCategory;
  accessLevel: AccessLevel;
  status: KnowledgeStatus;
  serviceType: string | null;
  /** After this date the document leaves search on its own. */
  validUntil: string | null;
  sourceFile: string | null;
  sourceRef: string | null;
  question: string | null;
  chunkCount: number;
  indexedAt: string | null;
  /** The last ingest failure — shown in red, cleared by a successful run. */
  indexError: string | null;
  createdAt: string;
  updatedAt: string;
  university: { id: string; slug: string; nameMn: string } | null;
  createdBy: NamedRef | null;
  updatedBy: NamedRef | null;
}

export interface KnowledgeChunkPreview {
  id: string;
  chunkIndex: number;
  /** The `H1 > H2 > H3` path this chunk sits under. */
  heading: string | null;
  content: string;
  tokenCount: number;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocumentListItem {
  body: string | null;
  contentHash: string | null;
  chunks: KnowledgeChunkPreview[];
}
