/** Backend-agnostic contract every storage driver implements (ARCHITECTURE.md §9). */
export interface StorageDriver {
  upload(path: string, buffer: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
  /** Logical delete only — ARCHITECTURE.md §9 forbids hard deletes during a contract's lifetime. */
  delete(path: string): Promise<void>;
}

export const ALLOWED_UPLOAD_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const;

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** Real magic-byte signatures for {@link ALLOWED_UPLOAD_EXTENSIONS} (0-09 MIME sniff). */
export const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/**
 * Magic-byte signatures for the knowledge base's sniffable uploads (2A-03).
 * Markdown and plain text are absent on purpose — they have no signature, and
 * `StorageService` checks them by decoding instead.
 */
export const KNOWLEDGE_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * What to stamp on an object as it is written, covering **both** prefixes —
 * case documents and the knowledge base's own types (2A-03). It is deliberately
 * wider than {@link CONTENT_TYPE_BY_EXTENSION}, which answers the narrower
 * question of what `GET /files/:token` may serve back to a browser.
 */
export const STORED_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ...CONTENT_TYPE_BY_EXTENSION,
  ...KNOWLEDGE_MIME_BY_EXTENSION,
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};
