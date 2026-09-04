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

/** 1G-14 — the dated promo strip on the public site. */
export type BannerPlacement = 'SITE_TOP' | 'HOME_HERO';

export interface BannerItem {
  id: string;
  placement: BannerPlacement;
  titleMn: string;
  bodyMn: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
