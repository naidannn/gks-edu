import { describe, expect, it } from 'vitest';
import { renderChatMarkdown, stripCitations } from '../app/utils/chat-markdown';

describe('stripCitations', () => {
  it('drops single and grouped markers with the space before them', () => {
    expect(stripCitations('Хугацаа 2026-10-13 [T1]. Үнэ [K1, T2] өөр.')).toBe('Хугацаа 2026-10-13. Үнэ өөр.');
  });

  it('leaves ordinary brackets alone', () => {
    expect(stripCitations('[Сөүл] хот, [1] биш')).toBe('[Сөүл] хот, [1] биш');
  });
});

describe('renderChatMarkdown', () => {
  it('turns the deadline list the assistant writes into a list, without markers', () => {
    const html = renderChatMarkdown(
      '* **Сунсил их сургууль (Soongsil University):** 2026-10-13 [T1]\n' +
        '* **Соган их сургууль:** 2026-10-15 [T1]\n\n' +
        'Та аль нэг сургуулийг сонирхож байна уу?',
    );

    expect(html).toBe(
      '<ul><li><strong>Сунсил их сургууль (Soongsil University):</strong> 2026-10-13</li>' +
        '<li><strong>Соган их сургууль:</strong> 2026-10-15</li></ul>' +
        '<p>Та аль нэг сургуулийг сонирхож байна уу?</p>',
    );
    expect(html).not.toContain('[T1]');
    expect(html).not.toContain('*');
  });

  it('keeps numbered steps numbered, and lines in a paragraph on their own lines', () => {
    expect(renderChatMarkdown('1. Паспорт\n2. Диплом')).toBe('<ol><li>Паспорт</li><li>Диплом</li></ol>');
    expect(renderChatMarkdown('Нэг\nХоёр')).toBe('<p>Нэг<br>Хоёр</p>');
  });

  it('escapes HTML, so the model cannot inject markup', () => {
    expect(renderChatMarkdown('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('links only to our pages and the web', () => {
    expect(renderChatMarkdown('[Төлөвлөгөө](/plan)')).toBe('<p><a href="/plan">Төлөвлөгөө</a></p>');
    expect(renderChatMarkdown('[x](javascript:void0)')).toBe('<p>x</p>');
  });

  it('hides a bold marker the stream has only half delivered', () => {
    expect(renderChatMarkdown('* **Сунсил их')).toBe('<ul><li>Сунсил их</li></ul>');
  });
});
