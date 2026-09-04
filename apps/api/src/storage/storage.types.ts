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
