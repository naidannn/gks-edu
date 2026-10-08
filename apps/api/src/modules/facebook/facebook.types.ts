import type { PageEntry } from './facebook-webhook.js';

/** One attachment as `facebook_messages.attachments` stores it. */
export interface FacebookAttachmentRow {
  type: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'other';
  url: string | null;
}

/** `facebook-inbound` job: one webhook entry, verified, not yet stored. */
export interface FacebookInboundJob {
  entry: PageEntry;
}

/** `facebook-assistant` jobs. */
export interface FacebookReplyJob {
  threadId: string;
}

export interface FacebookCommentJob {
  commentId: string;
}
