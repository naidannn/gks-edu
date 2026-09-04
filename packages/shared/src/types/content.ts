/** Blog/news and FAQ payloads (1A-11, 1A-12, 1A-13). */

export type PostStatus = 'DRAFT' | 'PUBLISHED';
export type FaqCategory =
  | 'GENERAL'
  | 'SERVICES'
  | 'PRICING'
  | 'DOCUMENTS'
  | 'VISA'
  | 'LANGUAGE_CENTER';

export interface PostCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImagePath: string | null;
  tags: string[];
  publishedAt: string | null;
}

export interface PostDetail extends PostCard {
  content: string;
  status: PostStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null } | null;
}

export interface FaqEntry {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  order: number;
}
