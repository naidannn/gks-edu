import { describe, expect, it } from 'vitest';
import { NotificationEvent } from '../../../prisma/client.js';
import { parseEmailBody } from './email-content.js';
import { EVENT_PRESENTATION, presentationFor } from './email-presentation.js';
import { renderEmail } from './email-template.js';

const APP_URL = 'https://gksedu.mn';

describe('parseEmailBody (1G-03 layout model)', () => {
  it('promotes `Нэр: утга` runs to a fact table, and keeps the sentence above them a paragraph', () => {
    const { blocks } = parseEmailBody(
      'Гэрээ баталгаажлаа.\nГэрээний дугаар: GKS-C-1\nҮйлчилгээ: GKS-2026-0148',
    );

    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['Гэрээ баталгаажлаа.'] },
      {
        kind: 'facts',
        rows: [
          { label: 'Гэрээний дугаар', value: 'GKS-C-1' },
          { label: 'Үйлчилгээ', value: 'GKS-2026-0148' },
        ],
      },
    ]);
  });

  it('leaves a sentence that merely contains a colon as prose', () => {
    const { blocks } = parseEmailBody('Таны визний хариу бүртгэгдлээ: Виз гарсан');
    expect(blocks[0]?.kind).toBe('paragraph');
  });

  it('collects bullets into a list', () => {
    const { blocks } = parseEmailBody('Дутуу:\n- Иргэний үнэмлэх\n- Банкны тодорхойлолт');
    expect(blocks).toContainEqual({
      kind: 'list',
      items: ['Иргэний үнэмлэх', 'Банкны тодорхойлолт'],
    });
  });

  it('lifts the link out of the body and drops the stub that only announced it', () => {
    const { blocks, url } = parseEmailBody('Төлбөрөө төлнө үү.\n\nQPay-ээр төлөх: https://gksedu.mn/app/pay');

    expect(url).toBe('https://gksedu.mn/app/pay');
    expect(blocks).toEqual([{ kind: 'paragraph', lines: ['Төлбөрөө төлнө үү.'] }]);
  });

  it('keeps a residue long enough to be a real sentence', () => {
    const { blocks } = parseEmailBody('Материалаа кабинетаараа орж илгээнэ үү: https://gksedu.mn/app');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['Материалаа кабинетаараа орж илгээнэ үү'] },
    ]);
  });

  it('drops the sign-off — the layout has a footer of its own', () => {
    const { blocks } = parseEmailBody('Баярлалаа.\n\nGKS EDU GROUP');
    expect(blocks).toEqual([{ kind: 'paragraph', lines: ['Баярлалаа.'] }]);
  });

  it('drops a fact whose value the dispatcher could not fill', () => {
    const { blocks } = parseEmailBody('Үйлчилгээ: GKS-1\nУрилга: —');
    expect(blocks).toEqual([{ kind: 'facts', rows: [{ label: 'Үйлчилгээ', value: 'GKS-1' }] }]);
  });
});

describe('renderEmail', () => {
  const message = {
    subject: 'Төлбөр баталгаажлаа',
    eyebrow: 'Төлбөр',
    tone: 'success' as const,
    body: 'Сайн байна уу, Бат.\n\nДүн: 1,200,000₮',
    cta: { label: 'Төлбөрийн түүх', url: 'https://gksedu.mn/app/cases/1/payment' },
  };

  it('produces both an HTML and a plain-text part', () => {
    const { html, text } = renderEmail(message, APP_URL);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Төлбөр баталгаажлаа');
    expect(html).toContain('https://gksedu.mn/app/cases/1/payment');
    // The text alternative must carry the link too — a client that shows only
    // `text/plain` would otherwise have no way through.
    expect(text).toContain('Төлбөрийн түүх: https://gksedu.mn/app/cases/1/payment');
  });

  it('escapes anything that came from the database', () => {
    const { html } = renderEmail(
      { ...message, body: 'Тайлбар: <script>alert(1)</script>' },
      APP_URL,
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('resolves the logo against the app URL, so the header renders in production', () => {
    const { html } = renderEmail(message, 'https://gksedu.mn/');
    expect(html).toContain('src="https://gksedu.mn/img/brand/gks-logo-knockout.png"');
  });

  it('omits the button — and its fallback line — when there is nothing to link to', () => {
    const { html } = renderEmail({ ...message, cta: null }, APP_URL);
    expect(html).not.toContain('Товч ажиллахгүй бол');
  });
});

describe('EVENT_PRESENTATION', () => {
  it('names a badge, a tone and a button label for every event', () => {
    for (const event of Object.values(NotificationEvent)) {
      const look = EVENT_PRESENTATION[event];
      expect(look, `${event} has no presentation`).toBeDefined();
      expect(look.ctaLabel.length).toBeGreaterThan(0);
    }
  });

  it('takes a tone override from the context, and ignores a bogus one', () => {
    expect(presentationFor(NotificationEvent.VISA_RESULT, 'critical').tone).toBe('critical');
    expect(presentationFor(NotificationEvent.VISA_RESULT, 'chartreuse').tone).toBe('info');
  });
});
