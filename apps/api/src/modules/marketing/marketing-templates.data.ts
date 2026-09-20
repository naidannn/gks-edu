/**
 * The campaign templates the office starts from (1O).
 *
 * One per thing GKS EDU actually mails: the monthly newsletter, a GKS
 * scholarship round, news from a school, an expo invitation. They are seeded
 * with a `key` so a deploy can top up what is missing without ever touching
 * wording an admin has edited — the same contract `NOTIFICATION_TEMPLATES`
 * keeps.
 *
 * The bodies are written to be edited, not sent as they stand: they carry the
 * shape of the mail (a greeting, three bullets, a closing line) and obvious
 * placeholders for the month's actual content.
 */

export interface MarketingTemplateSeed {
  key: string;
  name: string;
  subject: string;
  eyebrow?: string;
  heading?: string;
  bodyMn: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  tone?: 'info' | 'success' | 'warning' | 'critical';
}

export const MARKETING_TEMPLATES: MarketingTemplateSeed[] = [
  {
    key: 'newsletter',
    name: 'Сарын мэдээлэл (Newsletter)',
    subject: 'GKS EDU — {{firstName}}, энэ сарын шинэ мэдээлэл',
    eyebrow: 'Мэдээлэл',
    heading: 'Энэ сард юу болж байна вэ',
    tone: 'info',
    bodyMn: [
      'Сайн байна уу, {{firstName}}.',
      '',
      'Солонгост суралцахтай холбоотой энэ сарын гол мэдээллийг хүргэж байна.',
      '',
      '- Нээлттэй элсэлт: (сургууль, улирлаа бичнэ үү)',
      '- Шинэ хөтөлбөр: (мэргэжил, сургалтын төлбөр)',
      '- Зөвлөгөө: (нэг богино зөвлөгөө)',
      '',
      'Дэлгэрэнгүйг манай сайтаас уншаарай.',
    ].join('\n'),
    ctaLabel: 'Сайт руу очих',
    ctaUrl: 'https://gksedu.mn/blog',
    footerNote: 'Асуух зүйл байвал энэ захидалд хариу бичих эсвэл 7710-9000 дугаарт залгаарай.',
  },
  {
    key: 'gks-campaign',
    name: 'GKS тэтгэлгийн кампанит ажил',
    subject: 'GKS тэтгэлгийн бүртгэл нээлттэй — {{firstName}}',
    eyebrow: 'GKS тэтгэлэг',
    heading: 'Солонгосын Засгийн газрын тэтгэлэг',
    tone: 'success',
    bodyMn: [
      'Сайн байна уу, {{firstName}}.',
      '',
      'Солонгосын Засгийн газрын тэтгэлэг (GKS)-ийн шинэ шатны бүртгэл нээлттэй байна. ' +
        'Тэтгэлэг нь сургалтын төлбөр, амьжиргааны зардал, нислэгийн зардлыг бүрэн хамардаг.',
      '',
      'Бүртгэлийн хугацаа: (огноо)',
      'Шаардлага: (боловсролын түвшин, GPA, нас)',
      '',
      'Та тэнцэх боломжтой эсэхээ 2 минутад шалгаарай.',
    ].join('\n'),
    ctaLabel: 'Боломжоо шалгах',
    ctaUrl: 'https://gksedu.mn/gks-check',
    footerNote: 'Бүртгэлийн хугацаа хаагдсаны дараа материал хүлээн авах боломжгүй.',
  },
  {
    key: 'university-news',
    name: 'Сургуулийн мэдээ',
    subject: '{{firstName}}, сонирхсон сургуулийн шинэ мэдээлэл',
    eyebrow: 'Сургууль',
    heading: 'Сургуулийн шинэ мэдээлэл',
    tone: 'info',
    bodyMn: [
      'Сайн байна уу, {{firstName}}.',
      '',
      '(Сургуулийн нэр)-ийн талаар мэдэх ёстой шинэ мэдээллийг хүргэж байна.',
      '',
      'Сургууль: (нэр)',
      'Элсэлт: (улирал, эцсийн хугацаа)',
      'Сургалтын төлбөр: (нэг улирлын төлбөр)',
      '',
      'Дэлгэрэнгүй мэдээлэл болон бусад сургуулийн харьцуулалтыг каталогоос харна уу.',
    ].join('\n'),
    ctaLabel: 'Каталог харах',
    ctaUrl: 'https://gksedu.mn/universities',
  },
  {
    key: 'expo',
    name: 'Экспо / уулзалтын урилга',
    subject: 'Урилга: Солонгосын боловсролын экспо — {{firstName}}',
    eyebrow: 'Урилга',
    heading: 'Танд урилга байна',
    tone: 'success',
    bodyMn: [
      'Сайн байна уу, {{firstName}}.',
      '',
      'Солонгосын их сургуулиудын төлөөлөгчидтэй биечлэн уулзах боломжтой ' +
        'арга хэмжээнд урьж байна.',
      '',
      'Огноо: (өдөр, цаг)',
      'Байршил: (хаяг)',
      'Оролцох сургууль: (жагсаалт)',
      '',
      'Суудлын тоо хязгаартай тул урьдчилан бүртгүүлээрэй.',
    ].join('\n'),
    ctaLabel: 'Бүртгүүлэх',
    ctaUrl: 'https://gksedu.mn/consultation',
    footerNote: 'Оролцох боломжгүй бол энэ захидалд хариу бичээрэй — бид бичлэгийг хүргэнэ.',
  },
];
