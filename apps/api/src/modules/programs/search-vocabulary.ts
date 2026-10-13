/**
 * The words people say, mapped to the words schools print (1I-15).
 *
 * A visitor asks for "IT", "AI", "нягтлан бодогч" or "санхүүч"; a school
 * publishes "Computer Science and Engineering", "회계학과", "Нягтлан бодох
 * бүртгэл". None of the first contain any of the second, so a search on the
 * typed word alone returns nothing — or, for "IT", every "Arch**it**ecture" in
 * the catalogue.
 *
 * Each area is a field as a Mongolian family talks about it, deliberately
 * broad: someone who says "AI" or "программист" wants to study IT, and is shown
 * every computing programme, not only the ones with "AI" in the name. A word
 * may sit in more than one area ("барилга" is both architecture and civil
 * engineering, "эрүүл мэнд" is both medicine and nursing); the search takes the
 * union.
 *
 * This expands the *query* and nothing else. It is not the subject taxonomy
 * that was removed in 1I — no programme is tagged with an area, nothing is
 * stored, and a programme is still found only by its own published names
 * (ARCHITECTURE.md §3.3). Adding a word is a one-line change here.
 *
 * - `asked` — what people type, lower case. A word matches at the start of any
 *   word in the query, so Mongolian suffixes come along: "санхүүгээр",
 *   "нягтлан бодогчоор", "хиймэл оюун ухаанаар сурмаар байна". Words of two
 *   characters, and Latin ones of three ("it", "ai", "mba"), must stand alone.
 * - `named` — fragments of programme and college names, in the three languages
 *   the catalogue holds. An acronym written in capitals ("IT", "AI", "MBA")
 *   matches case-sensitively; everything else ignores case.
 */
export interface SearchArea {
  /** A Mongolian label — for tests, logs and whoever extends this list. */
  label: string;
  asked: readonly string[];
  named: readonly string[];
}

export const SEARCH_AREAS: readonly SearchArea[] = [
  {
    label: 'IT, компьютер, хиймэл оюун',
    asked: [
      'it', 'ит', 'ай ти', 'айти', 'мт', 'мэдээллийн технологи', 'мэдээлэл зүй', 'информатик',
      'компьютер', 'компютер', 'програм', 'программ', 'кодинг', 'код бичи', 'хөгжүүлэгч', 'девелопер',
      'вэб', 'веб', 'ai', 'аи', 'хиймэл оюун', 'машин сургалт', 'дата', 'өгөгдөл', 'кибер',
      'мэдээллийн аюулгүй', 'мэдээллийн хамгаалалт', 'сүлжээ', 'тоглоом хөгжүүл', 'game',
      'computer', 'software', 'coding', 'developer', 'programming', 'artificial intelligence',
      'machine learning', 'data', 'cyber', 'information technology', '컴퓨터', '소프트웨어', '인공지능',
      '정보통신', '데이터',
    ],
    named: [
      'компьютер', 'програм', 'мэдээллийн технологи', 'мэдээлэл зүй', 'информатик', 'мэдээллийн хамгаалалт',
      'мэдээллийн аюулгүй', 'кибер', 'хиймэл оюун', 'өгөгдлийн шинжлэх', 'өгөгдлийн ухаан',
      'IT', 'AI', 'computer', 'computing', 'software', 'information technology', 'informatics',
      'information security', 'information system', 'cyber', 'artificial intelligence', 'data science',
      'machine learning', 'game', '컴퓨터', '소프트웨어', '정보통신', '정보보호', '정보보안', '정보공학',
      '정보시스템', '인공지능', '데이터', '전산', '게임',
    ],
  },
  {
    label: 'Санхүү, нягтлан бодох бүртгэл, банк',
    asked: [
      'санхүү', 'нягтлан', 'аудит', 'банк', 'даатгал', 'хөрөнгө оруулалт', 'татвар', 'актуар',
      'finance', 'financial', 'accounting', 'accountant', 'banking', 'insurance', 'investment', 'audit',
      '금융', '재무', '회계', '세무', '보험',
    ],
    named: [
      'санхүү', 'нягтлан бодох', 'аудит', 'банк', 'даатгал', 'хөрөнгө оруулалт', 'татвар', 'актуар',
      'financ', 'accounting', 'banking', 'insurance', 'investment', 'actuar', 'taxation',
      '금융', '재무', '회계', '세무', '보험',
    ],
  },
  {
    label: 'Бизнес, менежмент',
    asked: [
      'бизнес', 'менежмент', 'менежер', 'удирдлага', 'худалдаа', 'mba', 'business', 'management',
      'trade', 'commerce', '경영', '무역',
    ],
    named: [
      'бизнес', 'менежмент', 'удирдлага', 'худалдаа', 'MBA', 'business', 'management',
      'commerce', 'trade', '경영', '무역', '상경',
    ],
  },
  {
    label: 'Эдийн засаг',
    asked: ['эдийн засаг', 'economics', 'economist', 'economy', '경제'],
    named: ['эдийн засаг', 'econom', '경제'],
  },
  {
    label: 'Маркетинг, реклам',
    asked: [
      'маркетинг', 'реклам', 'зар сурталчилгаа', 'сурталчилгаа', 'брэнд', 'pr', 'олон нийттэй харилцаа',
      'marketing', 'advertising', 'branding', '마케팅', '광고', '홍보',
    ],
    named: [
      'маркетинг', 'реклам', 'сурталчилгаа', 'олон нийттэй харилцаа', 'marketing', 'advertising',
      'public relations', '마케팅', '광고', '홍보',
    ],
  },
  {
    label: 'Анагаах ухаан, эм зүй',
    asked: [
      'эмч', 'анагаах', 'медицин', 'шүд', 'эм зүй', 'эмийн', 'уламжлалт анагаах', 'эрүүл мэнд',
      'medicine', 'medical', 'doctor', 'dentist', 'dentistry', 'pharmacy', '의학', '의대', '치의', '약학', '한의',
    ],
    named: [
      'анагаах', 'шүд', 'эм зүй', 'эмийн', 'medicine', 'medical', 'dentistry', 'dental', 'pharma',
      '의학', '의예', '치의', '약학', '한의',
    ],
  },
  {
    label: 'Сувилахуй, эрүүл мэндийн шинжлэх ухаан',
    asked: [
      'сувила', 'эрүүл мэнд', 'физик эмчилгээ', 'сэргээн засах', 'лаборант', 'лаборатори', 'рентген',
      'nurse', 'nursing', 'health', 'physical therapy', 'rehabilitation', '간호', '보건', '물리치료',
    ],
    named: [
      'сувила', 'эрүүл мэнд', 'физик эмчилгээ', 'сэргээн засах', 'nursing', 'health', 'physical therapy',
      'rehabilitation', 'radiolog', '간호', '보건', '물리치료', '재활', '임상병리', '방사선',
    ],
  },
  {
    label: 'Хууль, эрх зүй',
    asked: ['хууль', 'эрх зүй', 'өмгөөлөгч', 'прокурор', 'шүүгч', 'law', 'lawyer', 'legal', '법학', '법률'],
    named: ['хууль', 'эрх зүй', 'law', 'legal', '법학', '법률', '법무'],
  },
  {
    label: 'Олон улсын харилцаа, улс төр',
    asked: [
      'олон улсын харилцаа', 'дипломат', 'улс төр', 'international relations', 'international studies',
      'diplomacy', 'political', 'politics', '국제관계', '국제학', '외교', '정치',
    ],
    named: [
      'олон улсын харилцаа', 'олон улс судлал', 'дипломат', 'улс төр', 'international relations',
      'international studies', 'diplomacy', 'political', 'politics', '국제관계', '국제학', '외교', '정치',
    ],
  },
  {
    label: 'Сэтгэл судлал',
    asked: ['сэтгэл судлал', 'сэтгэл зүй', 'сэтгэл судлаач', 'психолог', 'зөвлөгөө өгөх', 'psycholog', 'counsel', '심리', '상담'],
    named: ['сэтгэл судлал', 'сэтгэл зүй', 'psycholog', 'counsel', '심리', '상담'],
  },
  {
    label: 'Боловсрол, багш',
    asked: ['багш', 'боловсрол', 'сурган хүмүүжүүл', 'цэцэрлэг', 'education', 'teacher', 'teaching', '교육', '유아'],
    named: ['боловсрол', 'багш', 'сурган хүмүүжүүл', 'education', 'pedagog', 'teaching', '교육', '유아'],
  },
  {
    label: 'Дизайн, загвар, анимэйшн',
    asked: [
      'дизайн', 'интерьер', 'хувцасны', 'загварлаг', 'анимэйшн', 'анимац', 'вэбтүүн', 'design', 'ux',
      'fashion', 'animation', 'webtoon', '디자인', '패션', '의상', '애니메이션', '웹툰',
    ],
    named: [
      'дизайн', 'хувцас', 'анимэйшн', 'анимац', 'design', 'UX', 'fashion', 'animation', 'webtoon',
      '디자인', '패션', '의상', '의류', '애니메이션', '웹툰',
    ],
  },
  {
    label: 'Архитектур',
    asked: ['архитектур', 'архитектор', 'барилга', 'architecture', 'architect', '건축'],
    named: ['архитектур', 'architect', '건축'],
  },
  {
    label: 'Барилга, иргэний инженерчлэл',
    asked: ['барилга', 'иргэний инженер', 'зам гүүр', 'civil', 'construction', '토목', '건설'],
    named: ['барилга', 'иргэний инженер', 'civil', 'construction', '토목', '건설'],
  },
  {
    label: 'Механик, автомашин, робот',
    asked: [
      'механик', 'машин', 'авто', 'робот', 'мехатроник', 'mechanical', 'automotive', 'automobile',
      'robot', 'mechatronic', '기계', '자동차', '로봇',
    ],
    named: [
      'механик', 'машин механизм', 'машины инженер', 'автомашин', 'автомобил', 'робот', 'мехатроник',
      'mechanical', 'automotive', 'robot', 'mechatronic', '기계', '자동차', '로봇',
    ],
  },
  {
    label: 'Цахилгаан, электроник, хагас дамжуулагч',
    asked: [
      'цахилгаан', 'электрон', 'хагас дамжуулагч', 'electric', 'electronic', 'semiconductor', '전기', '전자', '반도체',
    ],
    named: ['цахилгаан', 'электрон', 'хагас дамжуулагч', 'electric', 'electronic', 'semiconductor', '전기', '전자', '반도체'],
  },
  {
    label: 'Уул уурхай, эрчим хүч, геологи',
    asked: [
      'уул уурхай', 'уурхай', 'геологи', 'эрчим хүч', 'газрын тос', 'mining', 'geology', 'energy',
      '광산', '자원공학', '에너지', '지질',
    ],
    named: [
      'уул уурхай', 'уурхай', 'геологи', 'эрчим хүч', 'mining', 'geolog', 'energy', 'mineral', 'petroleum',
      '광산', '광물', '자원공학', '에너지', '지질',
    ],
  },
  {
    label: 'Хими, материал',
    asked: ['хими', 'материал', 'chemistry', 'chemical', 'materials', '화학', '신소재', '재료'],
    named: ['хими', 'материал', 'chemi', 'material', '화학', '신소재', '재료'],
  },
  {
    label: 'Биологи, биотехнологи',
    asked: ['биологи', 'биотехнологи', 'био', 'генетик', 'biology', 'biotech', 'life science', '생명', '생물', '바이오'],
    named: ['биологи', 'биотехнологи', 'амьдралын шинжлэх', 'генетик', 'biolog', 'biotech', 'life science', 'genetic', '생명', '생물', '바이오'],
  },
  {
    label: 'Хоол, хүнсний технологи',
    asked: [
      'хоол', 'тогооч', 'шеф', 'хүнс', 'нарийн боов', 'бариста', 'кофе', 'culinary', 'cooking', 'chef',
      'food', 'baking', 'barista', '조리', '외식', '식품', '제과', '제빵',
    ],
    named: [
      // Not a bare 'хоол': "Дуу хоолой" is vocal music. The English and Korean
      // names below catch every food programme anyway.
      'хоолны', 'тогооч', 'хүнс', 'нарийн боов', 'culinary', 'food', 'cook', 'baking', 'bakery', 'barista',
      '조리', '외식', '식품', '제과', '제빵', '바리스타', '커피',
    ],
  },
  {
    label: 'Хөдөө аж ахуй, мал эмнэлэг',
    asked: ['хөдөө аж ахуй', 'мал', 'газар тариалан', 'agricultur', 'veterinar', '농업', '수의', '축산'],
    named: ['хөдөө аж ахуй', 'малын', 'мал эмнэлэг', 'мал аж ахуй', 'мал зүй', 'газар тариалан', 'agricultur', 'veterinar', 'animal science', '농업', '수의', '축산', '농생명'],
  },
  {
    label: 'Аялал жуулчлал, зочид буудал, агаарын үйлчилгээ',
    asked: [
      'аялал', 'жуулчлал', 'зочид буудал', 'зочлох үйлчилгээ', 'стюардесс', 'онгоцны үйлчлэгч', 'tourism',
      'hotel', 'hospitality', 'airline', 'flight attendant', 'cabin crew', '관광', '호텔', '항공서비스',
    ],
    named: [
      'аялал', 'жуулчлал', 'зочид буудал', 'зочлох үйлчилгээ', 'tourism', 'hotel', 'hospitality',
      'airline', 'flight attendant', 'cabin crew', '관광', '호텔', '항공서비스', '항공관광',
    ],
  },
  {
    label: 'Нисэх, сансар',
    asked: ['нисэх', 'нисгэгч', 'пилот', 'сансар', 'aviation', 'pilot', 'aerospace', '항공', '비행'],
    named: ['нисэх', 'нисгэгч', 'сансар', 'aviation', 'pilot', 'aerospace', 'aeronaut', '항공', '비행'],
  },
  {
    label: 'Хэл, орчуулга, хэл шинжлэл',
    asked: [
      'хэл шинжлэл', 'орчуулга', 'орчуулагч', 'хэлмэрч', 'солонгос хэл', 'англи хэл', 'хятад хэл', 'япон хэл',
      'translation', 'interpret', 'linguistic', 'korean language', 'english', '통번역', '번역', '한국어', '언어학',
    ],
    named: [
      'хэл шинжлэл', 'орчуулга', 'хэлмэрч', 'солонгос хэл', 'англи хэл', 'хятад хэл', 'япон хэл',
      'translation', 'interpret', 'linguistic', 'korean language', 'english', 'chinese', 'japanese',
      '통번역', '번역', '한국어', '언어학', '국어국문', '영어', '중국어', '일본어',
    ],
  },
  {
    label: 'Сэтгүүл зүй, медиа',
    asked: [
      'сэтгүүл', 'медиа', 'хэвлэл мэдээлэл', 'телевиз', 'нэвтрүүлэгч', 'контент', 'journalism', 'journalist',
      'media', 'broadcast', '언론', '미디어', '방송',
    ],
    named: [
      'сэтгүүл', 'медиа', 'хэвлэл мэдээлэл', 'journalism', 'media', 'broadcast', 'mass communication',
      '언론', '미디어', '방송', '신문방송', '영상',
    ],
  },
  {
    label: 'Хөгжим, бүжиг, жүжиг, кино',
    asked: [
      'урлаг', 'кино', 'найруулагч', 'жүжиг', 'хөгжим', 'дуучин', 'дуулах', 'бүжиг', 'кпоп', 'k-pop', 'kpop',
      'айдол', 'entertainment', 'film', 'cinema', 'music', 'acting', 'dance', '음악', '영화', '연기', '연극', '무용',
      '실용음악', '엔터테인먼트',
    ],
    named: [
      'кино', 'жүжиг', 'хөгжим', 'бүжиг', 'дуу хоолой', 'тайзны', 'film', 'cinema', 'music', 'acting', 'theater',
      'theatre', 'dance', 'vocal', 'performing', 'entertainment', '음악', '영화', '연기', '연극', '무용', '공연',
      '엔터테인먼트',
    ],
  },
  {
    label: 'Дүрслэх урлаг',
    asked: ['урлаг', 'зураач', 'уран зураг', 'зураг зурах', 'гар урлал', 'fine art', 'painting', 'craft', '미술', '회화', '공예'],
    named: ['уран зураг', 'дүрслэх урлаг', 'гар урлал', 'fine art', 'painting', 'craft', 'sculpture', '미술', '회화', '공예', '조소'],
  },
  {
    label: 'Гоо сайхан',
    asked: ['гоо сайхан', 'гоо засал', 'косметик', 'үсчин', 'үс засал', 'нүүр будалт', 'beauty', 'cosmetic', 'makeup', 'hair', '뷰티', '미용', '화장품'],
    named: ['гоо сайхан', 'гоо засал', 'косметик', 'үс засал', 'beauty', 'cosmetic', 'makeup', 'hair', 'esthetic', '뷰티', '미용', '화장품', '코스메틱', '헤어', '메이크업'],
  },
  {
    label: 'Спорт',
    asked: ['спорт', 'биеийн тамир', 'дасгалжуулагч', 'фитнес', 'sport', 'fitness', '체육', '스포츠'],
    named: ['спорт', 'биеийн тамир', 'sport', 'physical education', 'exercise', 'kinesiology', '체육', '스포츠', '운동'],
  },
  {
    label: 'Нийгмийн ажил',
    asked: ['нийгмийн ажил', 'нийгмийн халамж', 'social work', 'social welfare', '사회복지'],
    named: ['нийгмийн ажил', 'нийгмийн халамж', 'social work', 'social welfare', '사회복지'],
  },
  {
    label: 'Логистик, тээвэр',
    asked: ['логистик', 'ложистик', 'тээвэр', 'нийлүүлэлт', 'logistics', 'supply chain', 'shipping', '물류', '해운', '유통'],
    named: ['логистик', 'тээвэр', 'нийлүүлэлт', 'logistic', 'supply chain', 'shipping', 'transport', '물류', '해운', '항만', '유통'],
  },
  {
    label: 'Математик, статистик',
    asked: ['математик', 'статистик', 'math', 'statistic', '수학', '통계'],
    named: ['математик', 'статистик', 'math', 'statistic', '수학', '통계'],
  },
  {
    label: 'Физик',
    asked: ['физик', 'physics', '물리학'],
    named: ['физик', 'physics', '물리학'],
  },
  {
    label: 'Байгаль орчин',
    asked: ['байгаль орчин', 'экологи', 'цаг уур', 'environment', 'ecology', 'climate', '환경', '기후'],
    named: ['байгаль орчин', 'экологи', 'цаг уур', 'environment', 'ecolog', 'climate', '환경', '기후'],
  },
];

/** A search fragment, and whether it must match its letters' case exactly. */
export interface SearchTerm {
  text: string;
  caseSensitive: boolean;
}

/**
 * An acronym is matched in capitals only: "IT" must find "IT융합" and must not
 * find "Arch**it**ecture" or "Secur**it**y", which a case-insensitive "it"
 * does — 1,800 programmes of the live catalogue, almost none of them
 * computing. In `named` an acronym is whatever is written in capitals; what a
 * visitor types is one if it is two Latin letters ("it", "ai", "ux"). Three is
 * already a word — "law", "art".
 */
export function namedTerm(text: string): SearchTerm {
  return { text, caseSensitive: /^[A-Z]{1,4}$/.test(text) };
}

export function queryTerm(text: string): SearchTerm {
  return /^[a-z]{1,2}$/i.test(text) ? { text: text.toUpperCase(), caseSensitive: true } : { text, caseSensitive: false };
}

/** Characters that end a word in a query. Hyphen included: "IT-ээр". */
const BOUNDARY = String.raw`\s.,;:!?/()\[\]"'«»\-`;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A short key ("it", "ai", "мт", "mba") would otherwise start half the words in Mongolian. */
function mustStandAlone(key: string): boolean {
  return key.length <= 2 || /^[a-z]{3}$/.test(key);
}

const MATCHERS = SEARCH_AREAS.map((area) => ({
  area,
  patterns: area.asked.map((word) => {
    const key = normalize(word);
    const end = mustStandAlone(key) ? `(?=$|[${BOUNDARY}])` : '';
    return new RegExp(`(?:^|[${BOUNDARY}])${escapeRegExp(key)}${end}`, 'u');
  }),
}));

/** The areas a query talks about — any of their `asked` words appears in it. */
export function searchAreasFor(query: string): SearchArea[] {
  const text = normalize(query);
  if (!text) return [];
  return MATCHERS.filter(({ patterns }) => patterns.some((pattern) => pattern.test(text))).map(({ area }) => area);
}

/**
 * Every fragment a query should be searched by: the query itself, then the
 * names of every area it mentions. De-duplicated, the query first.
 */
export function expandSearchQuery(query: string): SearchTerm[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const terms: SearchTerm[] = [];
  for (const term of [queryTerm(trimmed), ...searchAreasFor(trimmed).flatMap((area) => area.named.map(namedTerm))]) {
    const key = term.caseSensitive ? term.text : term.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}
