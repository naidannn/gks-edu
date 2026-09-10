/**
 * 교육국제화역량 인증제 — the Korean Ministry of Education's certification of a
 * university's capacity to host international students, as the office received
 * it in two lists (Шилдэг магадлан итгэмжлэгдсэн / Магадлан итгэмжлэгдсэн).
 *
 * This is the strongest visa signal on a card. A student admitted to an
 * `EXCELLENT` school goes through 비자심사 간소화 — simplified D-2/D-4 screening,
 * fewer financial documents, a faster decision; a `CERTIFIED` school's student
 * does not. It is not a quality ranking and must never be presented as one:
 * Seoul National University is `CERTIFIED`, Joongbu University is `EXCELLENT`.
 *
 * The two lists together name 135 schools, which is exactly the catalogue, so
 * every school gets a grade and `NONE` currently applies to nobody. That will
 * change when the next cycle is published or a school is added — `NONE` stays
 * the honest answer for "on neither list", never "not checked yet".
 *
 * Refresh procedure when the next cycle lands: replace both arrays, then
 * `pnpm accreditation:import`.
 */

export interface AccreditationRow {
  /** Our catalogue slug. Every row matched one when the lists were imported. */
  slug: string;
  /** The school's Korean name as the list prints it — keeps an unmatched row recognisable. */
  nameKo: string;
  nameEn: string;
}

/** 우수인증대학 — Шилдэг магадлан итгэмжлэгдсэн (35 schools). */
export const EXCELLENT_ACCREDITED: AccreditationRow[] = [
  { slug: 'konkuk-university', nameKo: '건국대학교', nameEn: "Konkuk University" },
  { slug: 'konyang-university', nameKo: '건양대학교 (본교)', nameEn: "Konyang University" },
  { slug: 'kyungpook-national-university', nameKo: '경북대학교', nameEn: "Kyungpook National University" },
  { slug: 'kyungsung-university', nameKo: '경성대학교', nameEn: "Kyungsung University" },
  { slug: 'kyung-hee-university', nameKo: '경희대학교', nameEn: "Kyung Hee University" },
  { slug: 'keimyung-university', nameKo: '계명대학교', nameEn: "Keimyung University" },
  { slug: 'korea-university', nameKo: '고려대학교', nameEn: "Korea University" },
  { slug: 'dankook-university', nameKo: '단국대학교 (본교)', nameEn: "Dankook University" },
  { slug: 'duksung-womens-university', nameKo: '덕성여자대학교', nameEn: "Duksung Women's University" },
  { slug: 'dongguk-university', nameKo: '동국대학교', nameEn: "Dongguk University" },
  { slug: 'pusan-national-university', nameKo: '부산대학교', nameEn: "Pusan National University" },
  { slug: 'busan-university-of-foreign-studies', nameKo: '부산외국어대학교', nameEn: "Busan University of Foreign Studies" },
  { slug: 'seokyeong-university', nameKo: '서경대학교', nameEn: "Seokyeong University" },
  { slug: 'university-of-seoul', nameKo: '서울시립대학교', nameEn: "University of Seoul" },
  { slug: 'seoul-theological-university', nameKo: '서울신학대학교', nameEn: "Seoul Theological University" },
  { slug: 'seoul-womens-university', nameKo: '서울여자대학교', nameEn: "Seoul Women's University" },
  { slug: 'sun-moon-university', nameKo: '선문대학교', nameEn: "Sun Moon University" },
  { slug: 'sungkyul-university', nameKo: '성결대학교', nameEn: "Sungkyul University" },
  { slug: 'sungkyunkwan-university', nameKo: '성균관대학교', nameEn: "Sungkyunkwan University (SKKU)" },
  { slug: 'sungshin-womens-university', nameKo: '성신여자대학교', nameEn: "Sungshin Women's University" },
  { slug: 'sejong-university', nameKo: '세종대학교', nameEn: "Sejong University" },
  { slug: 'sookmyung-womens-university', nameKo: '숙명여자대학교', nameEn: "Sookmyung Women's University" },
  { slug: 'ajou-university', nameKo: '아주대학교', nameEn: "Ajou University" },
  { slug: 'unist', nameKo: '울산과학기술원', nameEn: "Ulsan National Institute of Science and Technology (UNIST)" },
  { slug: 'ewha-womans-university', nameKo: '이화여자대학교', nameEn: "Ewha Womans University" },
  { slug: 'inha-university', nameKo: '인하대학교', nameEn: "Inha University" },
  { slug: 'jeju-national-university', nameKo: '제주대학교', nameEn: "Jeju National University" },
  { slug: 'joongbu-university', nameKo: '중부대학교', nameEn: "Joongbu University" },
  { slug: 'chung-ang-university', nameKo: '중앙대학교 (본교)', nameEn: "Chung-Ang University" },
  { slug: 'chungnam-national-university', nameKo: '충남대학교', nameEn: "Chungnam National University" },
  { slug: 'postech', nameKo: '포항공과대학교', nameEn: "Pohang University of Science and Technology (POSTECH)" },
  { slug: 'korea-aerospace-university', nameKo: '한국항공대학교', nameEn: "Korea Aerospace University" },
  { slug: 'hansung-university', nameKo: '한성대학교 (본교)', nameEn: "Hansung University" },
  { slug: 'hanyang-university', nameKo: '한양대학교', nameEn: "Hanyang University" },
  { slug: 'hongik-university', nameKo: '홍익대학교 (본교)', nameEn: "Hongik University" },
];

/** 인증대학 — Магадлан итгэмжлэгдсэн (100 schools/campuses). */
export const CERTIFIED_ACCREDITED: AccreditationRow[] = [
  { slug: 'gachon-university', nameKo: '가천대학교', nameEn: "Gachon University" },
  { slug: 'catholic-university-of-korea', nameKo: '가톨릭대학교', nameEn: "The Catholic University of Korea" },
  { slug: 'kangnam-university', nameKo: '강남대학교', nameEn: "Kangnam University" },
  { slug: 'gangseo-university', nameKo: '강서대학교', nameEn: "Gangseo University" },
  { slug: 'kangwon-national-university-gangneung', nameKo: '강원대학교(강릉캠퍼스)', nameEn: "Kangwon National University (Gangneung Campus)" },
  { slug: 'kangwon-national-university-samcheok', nameKo: '강원대학교(삼척캠퍼스)', nameEn: "Kangwon National University (Samcheok Campus)" },
  { slug: 'kangwon-national-university-wonju', nameKo: '강원대학교(원주캠퍼스)', nameEn: "Kangwon National University (Wonju Campus)" },
  { slug: 'kangwon-national-university-chuncheon', nameKo: '강원대학교(춘천캠퍼스)', nameEn: "Kangwon National University (Chuncheon Campus)" },
  { slug: 'konkuk-university-glocal', nameKo: '건국대학교(글로컬)', nameEn: "Konkuk University GLOCAL Campus" },
  { slug: 'kyonggi-university', nameKo: '경기대학교', nameEn: "Kyonggi University" },
  { slug: 'kyungnam-university', nameKo: '경남대학교', nameEn: "Kyungnam University" },
  { slug: 'kyungdong-university', nameKo: '경동대학교', nameEn: "Kyungdong University" },
  { slug: 'gyeongsang-national-university', nameKo: '경상국립대학교', nameEn: "Gyeongsang National University" },
  { slug: 'kyungwoon-university', nameKo: '경운대학교', nameEn: "Kyungwoon University" },
  { slug: 'kyungil-university', nameKo: '경일대학교', nameEn: "Kyungil University" },
  { slug: 'korea-university-sejong', nameKo: '고려대학교(세종)', nameEn: "Korea University (Sejong)" },
  { slug: 'kosin-university', nameKo: '고신대학교', nameEn: "Kosin University" },
  { slug: 'kwangwoon-university', nameKo: '광운대학교', nameEn: "Kwangwoon University" },
  { slug: 'gist', nameKo: '광주과학기술원', nameEn: "Gwangju Institute of Science and Technology (GIST)" },
  { slug: 'gwangju-university', nameKo: '광주대학교', nameEn: "Gwangju University" },
  { slug: 'kwangju-womens-university', nameKo: '광주여자대학교', nameEn: "Kwangju Women's University" },
  { slug: 'gyeongkuk-national-university', nameKo: '국립경국대학교', nameEn: "Gyeongkuk National University" },
  { slug: 'kongju-national-university', nameKo: '국립공주대학교', nameEn: "Kongju National University" },
  { slug: 'kunsan-national-university', nameKo: '국립군산대학교', nameEn: "Kunsan National University" },
  { slug: 'kumoh-national-institute-of-technology', nameKo: '국립금오공과대학교', nameEn: "Kumoh National Institute of Technology" },
  { slug: 'mokpo-national-university', nameKo: '국립목포대학교', nameEn: "Mokpo National University" },
  { slug: 'pukyong-national-university', nameKo: '국립부경대학교', nameEn: "Pukyong National University" },
  { slug: 'sunchon-national-university', nameKo: '국립순천대학교', nameEn: "Sunchon National University" },
  { slug: 'changwon-national-university', nameKo: '국립창원대학교', nameEn: "Changwon National University" },
  { slug: 'korea-national-university-of-transportation', nameKo: '국립한국교통대학교', nameEn: "Korea National University of Transportation" },
  { slug: 'korea-maritime-ocean-university', nameKo: '국립한국해양대학교', nameEn: "Korea Maritime & Ocean University" },
  { slug: 'hanbat-national-university', nameKo: '국립한밭대학교', nameEn: "Hanbat National University" },
  { slug: 'kookmin-university', nameKo: '국민대학교', nameEn: "Kookmin University" },
  { slug: 'gimcheon-university', nameKo: '김천대학교', nameEn: "Gimcheon University" },
  { slug: 'korea-nazarene-university', nameKo: '나사렛대학교', nameEn: "Korea Nazarene University" },
  { slug: 'namseoul-university', nameKo: '남서울대학교', nameEn: "Namseoul University" },
  { slug: 'daegu-catholic-university', nameKo: '대구가톨릭대학교', nameEn: "Daegu Catholic University" },
  { slug: 'daegu-university', nameKo: '대구대학교', nameEn: "Daegu University" },
  { slug: 'daegu-haany-university', nameKo: '대구한의대학교', nameEn: "Daegu Haany University" },
  { slug: 'daeshin-university', nameKo: '대신대학교', nameEn: "Daeshin University" },
  { slug: 'daejeon-university', nameKo: '대전대학교', nameEn: "Daejeon University" },
  { slug: 'daejin-university', nameKo: '대진대학교', nameEn: "Daejin University" },
  { slug: 'dongguk-university-wise', nameKo: '동국대학교(WISE)', nameEn: "Dongguk University (WISE Campus)" },
  { slug: 'dongduk-womens-university', nameKo: '동덕여자대학교', nameEn: "Dongduk Women's University" },
  { slug: 'tongmyong-university', nameKo: '동명대학교', nameEn: "Tongmyong University" },
  { slug: 'dongseo-university', nameKo: '동서대학교', nameEn: "Dongseo University" },
  { slug: 'dongshin-university', nameKo: '동신대학교', nameEn: "Dongshin University" },
  { slug: 'dong-a-university', nameKo: '동아대학교', nameEn: "Dong-A University" },
  { slug: 'dong-eui-university', nameKo: '동의대학교', nameEn: "Dong-Eui University" },
  { slug: 'myongji-university-seoul', nameKo: '명지대학교(서울캠퍼스)', nameEn: "Myongji University (Seoul Campus)" },
  { slug: 'mokwon-university', nameKo: '목원대학교', nameEn: "Mokwon University" },
  { slug: 'pai-chai-university', nameKo: '배재대학교', nameEn: "Pai Chai University" },
  { slug: 'baekseok-university', nameKo: '백석대학교', nameEn: "Baekseok University" },
  { slug: 'sahmyook-university', nameKo: '삼육대학교', nameEn: "Sahmyook University" },
  { slug: 'sangmyung-university', nameKo: '상명대학교', nameEn: "Sangmyung University" },
  { slug: 'sogang-university', nameKo: '서강대학교', nameEn: "Sogang University" },
  { slug: 'seoul-national-university-of-science-and-technology', nameKo: '서울과학기술대학교', nameEn: "Seoul National University of Science and Technology (SeoulTech)" },
  { slug: 'seoul-christian-university', nameKo: '서울기독대학교', nameEn: "Seoul Christian University" },
  { slug: 'seoul-national-university', nameKo: '서울대학교', nameEn: "Seoul National University" },
  { slug: 'sungkonghoe-university', nameKo: '성공회대학교', nameEn: "Sungkonghoe University" },
  { slug: 'semyung-university', nameKo: '세명대학교', nameEn: "Semyung University" },
  { slug: 'soonchunhyang-university', nameKo: '순천향대학교', nameEn: "Soonchunhyang University" },
  { slug: 'soongsil-university', nameKo: '숭실대학교', nameEn: "Soongsil University" },
  { slug: 'silla-university', nameKo: '신라대학교', nameEn: "Silla University" },
  { slug: 'shinhan-university', nameKo: '신한대학교', nameEn: "Shinhan University" },
  { slug: 'anyang-university', nameKo: '안양대학교', nameEn: "Anyang University" },
  { slug: 'yonsei-university', nameKo: '연세대학교', nameEn: "Yonsei University" },
  { slug: 'yonsei-university-mirae', nameKo: '연세대학교(미래)', nameEn: "Yonsei University MIRAE Campus" },
  { slug: 'yeungnam-university', nameKo: '영남대학교', nameEn: "Yeungnam University" },
  { slug: 'youngsan-university', nameKo: '영산대학교', nameEn: "Youngsan University" },
  { slug: 'woosuk-university', nameKo: '우석대학교', nameEn: "Woosuk University" },
  { slug: 'woosong-university', nameKo: '우송대학교', nameEn: "Woosong University" },
  { slug: 'university-of-ulsan', nameKo: '울산대학교', nameEn: "University of Ulsan" },
  { slug: 'wonkwang-university', nameKo: '원광대학교', nameEn: "Wonkwang University" },
  { slug: 'uiduk-university', nameKo: '위덕대학교', nameEn: "Uiduk University" },
  { slug: 'eulji-university', nameKo: '을지대학교', nameEn: "Eulji University" },
  { slug: 'inje-university', nameKo: '인제대학교', nameEn: "Inje University" },
  { slug: 'incheon-national-university', nameKo: '인천대학교', nameEn: "Incheon National University" },
  { slug: 'chonnam-national-university', nameKo: '전남대학교', nameEn: "Chonnam National University" },
  { slug: 'jeonbuk-national-university', nameKo: '전북대학교', nameEn: "Jeonbuk National University" },
  { slug: 'jeonju-university', nameKo: '전주대학교', nameEn: "Jeonju University" },
  { slug: 'chosun-university', nameKo: '조선대학교', nameEn: "Chosun University" },
  { slug: 'jungwon-university', nameKo: '중원대학교', nameEn: "Jungwon University" },
  { slug: 'cha-university', nameKo: '차의과학대학교', nameEn: "CHA University" },
  { slug: 'changshin-university', nameKo: '창신대학교', nameEn: "Changshin University" },
  { slug: 'cheongju-university', nameKo: '청주대학교', nameEn: "Cheongju University" },
  { slug: 'chungbuk-national-university', nameKo: '충북대학교', nameEn: "Chungbuk National University" },
  { slug: 'pyeongtaek-university', nameKo: '평택대학교', nameEn: "Pyeongtaek University" },
  { slug: 'kaist', nameKo: '한국과학기술원', nameEn: "Korea Advanced Institute of Science and Technology (KAIST)" },
  { slug: 'korea-national-university-of-education', nameKo: '한국교원대학교', nameEn: "Korea National University of Education" },
  { slug: 'koreatech', nameKo: '한국기술교육대학교', nameEn: "KOREATECH (Korea University of Technology and Education)" },
  { slug: 'korean-bible-university', nameKo: '한국성서대학교', nameEn: "Korean Bible University" },
  { slug: 'hankuk-university-of-foreign-studies', nameKo: '한국외국어대학교', nameEn: "Hankuk University of Foreign Studies" },
  { slug: 'hannam-university', nameKo: '한남대학교', nameEn: "Hannam University" },
  { slug: 'handong-global-university', nameKo: '한동대학교', nameEn: "Handong Global University" },
  { slug: 'hallym-university', nameKo: '한림대학교', nameEn: "Hallym University" },
  { slug: 'hanseo-university', nameKo: '한서대학교', nameEn: "Hanseo University" },
  { slug: 'hansei-university', nameKo: '한세대학교', nameEn: "Hansei University" },
  { slug: 'hanyang-university-erica', nameKo: '한양대학교(ERICA)', nameEn: "Hanyang University (ERICA Campus)" },
  { slug: 'hoseo-university', nameKo: '호서대학교', nameEn: "Hoseo University" },
];
