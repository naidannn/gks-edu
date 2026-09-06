/**
 * The company's name, address and telephone — written once.
 *
 * These three facts are what local search calls NAP consistency: the footer,
 * the `Organization` structured data and the Google Business listing have to
 * agree character for character, or they read as three different businesses in
 * one city. Keeping them in one object is the cheapest way to make that true.
 */
export const COMPANY = {
  name: 'GKS EDU GROUP',
  legalName: '«Жи Кэй Эс Эдү Групп» ХХК',

  /** E.164 for machines, the local grouping people actually dial for the link text. */
  phone: '+97677109000',
  phoneLabel: '7710-9000',

  /**
   * The public contact address, as published in the company's own profile
   * (`docs/GKS_EDU_GROUP_байгууллагын_танилцуулга.docx`, ХОЛБОО БАРИХ). Not to
   * be confused with `noreply@gksedu.mn`, the transactional sender, which must
   * never appear as somewhere to write to. The signed contract gives a third
   * address, `gksedugroup@gmail.com` — that one belongs on the contract only.
   */
  email: 'info@gksedu.mn',

  street: 'Eco International Tower, 17 давхар, 1707 тоот',
  /** Ulaanbaatar addresses are given by landmark; the tower alone finds no one. */
  landmark: 'Төв шуудангийн урд талд',
  city: 'Улаанбаатар',
  countryCode: 'MN',

  /** The same address on one line, for running text and structured data. */
  addressOneLine:
    'Улаанбаатар, Төв шуудангийн урд талд, Eco International Tower, 17 давхар, 1707 тоот',

  tagline:
    'Монгол оюутнуудад зориулсан Солонгост суралцах зуучлалын платформ. ' +
    'Зөвлөгөөнөөс виз хүртэлх бүх алхам нэг дор.',

  /** The company's own motto, from the cover of its profile. */
  motto: 'Gateway to Korean Studies',

  /** Contract §3.7 — the hours the office answers on. */
  workingHours: 'Даваа–Баасан, 09:00–18:00',

  /**
   * Contract §2.3 — the account the brokerage fee is transferred to. Quoted on
   * `/refund`; the authoritative copy is the contract template on the API side.
   */
  bank: {
    name: 'Төрийн банк',
    account: '9000 7710 9000',
    holder: '«Жи Кэй Эс Эдү Групп» ХХК',
  },
} as const;

/** The office on a map, without embedding a third-party frame in the page. */
export const COMPANY_MAP_URL =
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Eco International Tower Ulaanbaatar')}`;
