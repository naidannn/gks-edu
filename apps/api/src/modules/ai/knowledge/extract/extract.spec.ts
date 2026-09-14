import { describe, expect, it } from 'vitest';
import { htmlToBlocks, inferHeadings } from './docx.js';
import { extractMarkdown } from './markdown.js';
import { pdfTextToBlocks } from './pdf.js';
import { blocksToText } from './text-block.js';

/**
 * 2A-03 — extraction is where a document's structure is either kept or thrown
 * away, and the chunker cannot recover what is lost here. Mongolian Cyrillic
 * runs through every case: `ө`/`ү` and a soft hyphen are the characters a naive
 * byte-level cleaner mangles.
 */
describe('markdown extraction', () => {
  it('keeps heading depth and folds anything past H3', () => {
    const { blocks } = extractMarkdown(
      ['# Виз', '', '## D-4', '', 'Текст.', '', '#### Гүн гарчиг', '', 'Дахиад текст.'].join('\n'),
    );

    expect(blocks.map((block) => [block.level, block.text])).toEqual([
      [1, 'Виз'],
      [2, 'D-4'],
      [null, 'Текст.'],
      [3, 'Гүн гарчиг'],
      [null, 'Дахиад текст.'],
    ]);
  });

  it('joins wrapped lines into one paragraph but keeps paragraphs apart', () => {
    const { blocks } = extractMarkdown(
      ['Тэтгэлгийн материалыг', 'эрт бэлдэх нь зөв.', '', 'Хоёр дахь догол мөр.'].join('\n'),
    );

    expect(blocks).toEqual([
      { level: null, text: 'Тэтгэлгийн материалыг эрт бэлдэх нь зөв.' },
      { level: null, text: 'Хоёр дахь догол мөр.' },
    ]);
  });

  it('keeps a table as one block, rows intact', () => {
    const { blocks } = extractMarkdown(
      ['| Түвшин | Хугацаа |', '| --- | --- |', '| TOPIK 3 | 6 сар |', '', 'Дараах текст.'].join('\n'),
    );

    expect(blocks[0]!.text.split('\n')).toHaveLength(3);
    expect(blocks[0]!.text).toContain('TOPIK 3');
    expect(blocks[1]).toEqual({ level: null, text: 'Дараах текст.' });
  });

  it('makes each list item its own block — twelve documents are twelve facts', () => {
    const { blocks } = extractMarkdown(['- Паспорт', '- Диплом', '2) Голчийн тодорхойлолт'].join('\n'));

    expect(blocks.map((block) => block.text)).toEqual(['Паспорт', 'Диплом', 'Голчийн тодорхойлолт']);
  });

  it('reads an underlined heading', () => {
    const { blocks } = extractMarkdown(['Элсэлтийн хугацаа', '=================', '', 'Текст.'].join('\n'));

    expect(blocks[0]).toEqual({ level: 1, text: 'Элсэлтийн хугацаа' });
  });

  it('copies a fenced block through untouched', () => {
    const { blocks } = extractMarkdown(['```', 'line one', '  indented', '```'].join('\n'));

    expect(blocks[0]!.text).toBe('line one\n  indented');
  });

  it('treats plain text as paragraphs with no headings', () => {
    const { blocks } = extractMarkdown('Ямар ч гарчиггүй бичвэр.\n\nХоёр дахь.');

    expect(blocks.every((block) => block.level === null)).toBe(true);
  });

  it('strips a soft hyphen and normalises Word\u2019s exotic spaces', () => {
    // `бүрдүү\u00adлэх` looks like one word and is two to anything reading bytes.
    const { blocks } = extractMarkdown('Материал б\u00adүрдүүлэх\u00a0шаардлага');

    expect(blocks[0]!.text).toBe('Материал бүрдүүлэх шаардлага');
  });

  it('renders back to text with the headings marked — the hash input', () => {
    const { text } = extractMarkdown('# Гарчиг\n\nБие.');

    expect(text).toBe('# Гарчиг\n\nБие.');
    expect(blocksToText(extractMarkdown(text).blocks)).toBe(text);
  });
});

describe('docx extraction', () => {
  it('maps Word heading styles to depths and keeps paragraph order', () => {
    const blocks = htmlToBlocks(
      '<h1>Материал</h1><p>Нэг.</p><h2>Орчуулга</h2><p>Хоёр.</p><h4>Гүн</h4><p>Гурав.</p>',
    );

    expect(blocks.map((block) => [block.level, block.text])).toEqual([
      [1, 'Материал'],
      [null, 'Нэг.'],
      [2, 'Орчуулга'],
      [null, 'Хоёр.'],
      [3, 'Гүн'],
      [null, 'Гурав.'],
    ]);
  });

  it('keeps a table whole and in place, cells tab-separated', () => {
    const blocks = htmlToBlocks(
      '<p>Дээр.</p><table><tr><th>Сургууль</th><th>Хугацаа</th></tr>' +
        '<tr><td>Ёнсэ</td><td>3 сар</td></tr></table><p>Доор.</p>',
    );

    expect(blocks.map((block) => block.text)).toEqual([
      'Дээр.',
      'Сургууль\tХугацаа\nЁнсэ\t3 сар',
      'Доор.',
    ]);
  });

  it('unwraps list items and decodes entities', () => {
    const blocks = htmlToBlocks('<ul><li>Паспорт&nbsp;хуулбар</li><li>Диплом &amp; хавсралт</li></ul>');

    expect(blocks.map((block) => block.text)).toEqual(['Паспорт хуулбар', 'Диплом & хавсралт']);
  });

  it('reads capitalised section titles as headings when the file has no styles', () => {
    // The office's own handbook is written this way: 55 paragraphs, the section
    // titles shouted rather than styled.
    const blocks = inferHeadings(
      htmlToBlocks(
        '<p>ЕБС ТӨГССӨН БОЛ</p><p>I. ҮНДСЭН МАТЕРИАЛ</p><p>1. Өөрийн гадаад паспорт</p>' +
          '<p>Бүх материалыг англи хэл дээр нотариатаар батлуулна.</p>',
      ),
    );

    expect(blocks.map((block) => [block.level, block.text.slice(0, 20)])).toEqual([
      [1, 'ЕБС ТӨГССӨН БОЛ'],
      [2, 'I. ҮНДСЭН МАТЕРИАЛ'],
      [null, '1. Өөрийн гадаад пас'],
      [null, 'Бүх материалыг англи'],
    ]);
  });

  it('leaves a properly styled document alone — a guess never overrides a style', () => {
    const styled = htmlToBlocks('<h2>Виз</h2><p>ЭНЭ БОЛ ТОМ ҮСЭГТЭЙ ДОГОЛ МӨР</p>');

    expect(inferHeadings(styled)).toEqual(styled);
  });

  it('drops inline markup without eating the words around it', () => {
    const blocks = htmlToBlocks('<p>Энэ <strong>чухал</strong> бөгөөд <em>ү</em>нэн.</p>');

    expect(blocks[0]!.text).toBe('Энэ чухал бөгөөд үнэн.');
  });
});

describe('pdf extraction', () => {
  it('glues visually wrapped lines back into sentences', () => {
    const blocks = pdfTextToBlocks(
      ['Тэтгэлгийн материал бүрдүүлэхэд орчуулга,', 'нотариат, шуудан гэсэн гурван ажил байна.'].join('\n'),
    );

    expect(blocks).toEqual([
      {
        level: null,
        text: 'Тэтгэлгийн материал бүрдүүлэхэд орчуулга, нотариат, шуудан гэсэн гурван ажил байна.',
      },
    ]);
  });

  it('rejoins a word hyphenated across a line break', () => {
    const blocks = pdfTextToBlocks('материалыг бүрдүү-\nлэх шаардлагатай.');

    expect(blocks[0]!.text).toBe('материалыг бүрдүүлэх шаардлагатай.');
  });

  it('drops a bare page number', () => {
    const blocks = pdfTextToBlocks('Эхний хуудас.\n\n13\n\nДараагийн хуудас.');

    expect(blocks.map((block) => block.text)).toEqual(['Эхний хуудас.', 'Дараагийн хуудас.']);
  });

  it('never claims a heading — a PDF has none to claim', () => {
    const blocks = pdfTextToBlocks('ВИЗНИЙ МАТЕРИАЛ\nПаспорт шаардлагатай.');

    expect(blocks.every((block) => block.level === null)).toBe(true);
  });
});
