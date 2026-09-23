import type { EssayDocumentKind, QuestionnaireDefinition } from '@gks/shared';

/**
 * The Personal Statement and Study Plan written in the system (1D-28) — the
 * pieces that are plain logic, kept out of the components so they can be
 * tested (`$fetch` cannot be mocked in this app's tests).
 */

/** The questionnaire part that feeds the Study Plan; every other part feeds the Personal Statement. */
const STUDY_PLAN_PART = 'sp';

/** The slice of the questionnaire the writer needs beside one essay. */
export function essayDefinitionFor(definition: QuestionnaireDefinition, kind: EssayDocumentKind): QuestionnaireDefinition {
  const forStudyPlan = kind === 'STUDY_PLAN';
  return { ...definition, parts: definition.parts.filter((part) => (part.id === STUDY_PLAN_PART) === forStudyPlan) };
}

/**
 * A starting skeleton for an empty essay: one heading per English section title
 * the questionnaire already names ("Language Study Plan", "Future Plan after
 * Study" …), each followed by an empty paragraph. Empty when the questionnaire
 * names none — the master's Personal Statement is free-form.
 */
export function essayOutlineHtml(definition: QuestionnaireDefinition, kind: EssayDocumentKind): string {
  const headings: string[] = [];
  for (const part of essayDefinitionFor(definition, kind).parts) {
    for (const section of part.sections) {
      if (section.titleEn && !headings.includes(section.titleEn)) headings.push(section.titleEn);
    }
  }
  return headings.map((heading) => `<h2>${escapeHtml(heading)}</h2><p></p>`).join('');
}

/** Words as the school's form counts them — runs of non-space. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * The essay as a file Word opens: an HTML document with Word's namespaces,
 * served as `application/msword`. Not a true .docx, but it opens in Word and
 * LibreOffice with headings, lists and alignment intact — which is all the
 * office needs to paste it into the school's form or send it on.
 */
export function wordDocumentHtml(title: string, bodyHtml: string): string {
  return [
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
    '<head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->',
    '<style>',
    '@page { size: 21cm 29.7cm; margin: 2.5cm 2.5cm 2.5cm 2.5cm; }',
    "body { font-family: 'Times New Roman', 'Batang', serif; font-size: 12pt; line-height: 1.5; }",
    'h1 { font-size: 16pt; text-align: center; } h2 { font-size: 13pt; } h3 { font-size: 12pt; }',
    'p { margin: 0 0 8pt; }',
    '</style></head>',
    `<body>${bodyHtml}</body></html>`,
  ].join('');
}

/** `Бат_Болд_Personal_Statement.doc` */
export function essayFileName(applicantName: string, title: string): string {
  const safe = `${applicantName} ${title}`
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_');
  return `${safe}.doc`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Hands the essay over as a Word file. Browser-only. */
export function downloadWordDocument(title: string, bodyHtml: string, filename: string): void {
  // The byte-order mark makes Word read the Cyrillic and Hangul as UTF-8.
  const blob = new Blob(['\uFEFF', wordDocumentHtml(title, bodyHtml)], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
