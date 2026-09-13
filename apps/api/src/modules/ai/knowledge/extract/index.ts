import { BadRequestException } from '@nestjs/common';
import { extractDocx } from './docx.js';
import { extractMarkdown } from './markdown.js';
import { extractPdf } from './pdf.js';
import type { ExtractedDocument } from './text-block.js';

export * from './text-block.js';
export { htmlToBlocks } from './html.js';
export { extractDocx, extractMarkdown, extractPdf };

/** What the knowledge base accepts as an uploaded source file (2A-03). */
export const KNOWLEDGE_FILE_EXTENSIONS = ['docx', 'pdf', 'md', 'txt'] as const;
export type KnowledgeFileExtension = (typeof KNOWLEDGE_FILE_EXTENSIONS)[number];

export function isKnowledgeFileExtension(value: string): value is KnowledgeFileExtension {
  return (KNOWLEDGE_FILE_EXTENSIONS as readonly string[]).includes(value);
}

/**
 * Extracts a file's text by extension (2A-03).
 *
 * The extension, not the MIME type: `.md` and `.txt` have no magic bytes at all,
 * so `StorageService` has already decided what this file is — by sniffing the
 * ones that can be sniffed and by checking that the rest decode as UTF-8 text.
 * One decision, one place.
 */
export async function extractFile(params: {
  extension: KnowledgeFileExtension;
  buffer: Buffer;
}): Promise<ExtractedDocument> {
  switch (params.extension) {
    case 'docx':
      return extractDocx(params.buffer);
    case 'pdf':
      return extractPdf(params.buffer);
    case 'md':
    case 'txt':
      return extractMarkdown(params.buffer.toString('utf8'));
    default: {
      // Unreachable while the union holds — here so adding an extension without
      // an extractor fails to compile rather than at upload time.
      const exhaustive: never = params.extension;
      throw new BadRequestException(`Дэмжигдээгүй файлын төрөл: ${String(exhaustive)}`);
    }
  }
}
