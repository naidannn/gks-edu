/**
 * Times Higher Education — "Best universities in South Korea" 2026 edition.
 *
 *   https://www.timeshighereducation.com/student/best-universities/best-universities-south-korea
 *
 * This is the *base* rank of the two the catalogue carries: an outside,
 * citable number. The second one — `gksRank` — is ours and is computed
 * (ARCHITECTURE.md §3.1).
 *
 * Only 41 Korean universities appear in the table, against 135 in our
 * catalogue, and ties share a position (three schools sit at 8). A school
 * missing from this list is "рэйтингд ороогүй", which is not the same as last.
 *
 * `worldRank` is a string on purpose: THE publishes bands ("251–300", "1501+")
 * alongside exact positions, and a band cannot be sorted as a number.
 *
 * Refresh procedure when the 2027 table lands: update the rows, bump
 * `THE_RANKING_YEAR`, then `pnpm universities:rank-import`.
 */

export const THE_RANKING_YEAR = 2026;

/**
 * Worst position in the published table. Used to spread the base component
 * across its range — rank 1 scores 100, rank 40 scores the unranked floor.
 */
export const THE_KOREA_RANK_FLOOR = 40;

export interface TheKoreaRankingRow {
  /** Our catalogue slug, or null for a school we do not carry. */
  slug: string | null;
  /** Name as THE publishes it — kept so an unmatched row is recognisable. */
  nameEn: string;
  koreaRank: number;
  worldRank: string;
}

export const THE_KOREA_RANKING_2026: TheKoreaRankingRow[] = [
  { slug: 'seoul-national-university', nameEn: 'Seoul National University', koreaRank: 1, worldRank: '=58' },
  { slug: 'kaist', nameEn: 'Korea Advanced Institute of Science and Technology (KAIST)', koreaRank: 2, worldRank: '=70' },
  { slug: 'yonsei-university', nameEn: 'Yonsei University (Seoul campus)', koreaRank: 3, worldRank: '86' },
  { slug: 'sungkyunkwan-university', nameEn: 'Sungkyunkwan University (SKKU)', koreaRank: 4, worldRank: '87' },
  { slug: 'postech', nameEn: 'Pohang University of Science and Technology (POSTECH)', koreaRank: 5, worldRank: '=141' },
  { slug: 'korea-university', nameEn: 'Korea University', koreaRank: 6, worldRank: '=156' },
  { slug: 'unist', nameEn: 'Ulsan National Institute of Science and Technology (UNIST)', koreaRank: 7, worldRank: '201–250' },

  { slug: 'hanyang-university', nameEn: 'Hanyang University', koreaRank: 8, worldRank: '251–300' },
  { slug: 'kyung-hee-university', nameEn: 'Kyung Hee University', koreaRank: 8, worldRank: '251–300' },
  { slug: 'sejong-university', nameEn: 'Sejong University', koreaRank: 8, worldRank: '251–300' },

  // Not in our catalogue — kept so the import reports a known gap rather than
  // silently dropping a row.
  { slug: null, nameEn: 'Daegu Gyeongbuk Institute of Science and Technology (DGIST)', koreaRank: 11, worldRank: '351–400' },

  { slug: 'ajou-university', nameEn: 'Ajou University', koreaRank: 12, worldRank: '401–500' },
  { slug: 'chung-ang-university', nameEn: 'Chung-Ang University', koreaRank: 12, worldRank: '401–500' },
  { slug: 'gist', nameEn: 'Gwangju Institute of Science and Technology (GIST)', koreaRank: 12, worldRank: '401–500' },

  { slug: 'ewha-womans-university', nameEn: 'Ewha Womans University', koreaRank: 15, worldRank: '501–600' },
  { slug: 'gachon-university', nameEn: 'Gachon University', koreaRank: 15, worldRank: '501–600' },
  { slug: 'konkuk-university', nameEn: 'Konkuk University', koreaRank: 15, worldRank: '501–600' },
  { slug: 'kyungpook-national-university', nameEn: 'Kyungpook National University (KNU)', koreaRank: 15, worldRank: '501–600' },
  { slug: 'pusan-national-university', nameEn: 'Pusan National University', koreaRank: 15, worldRank: '501–600' },
  { slug: 'university-of-ulsan', nameEn: 'University of Ulsan', koreaRank: 15, worldRank: '501–600' },
  { slug: 'yeungnam-university', nameEn: 'Yeungnam University', koreaRank: 15, worldRank: '501–600' },

  { slug: 'catholic-university-of-korea', nameEn: 'The Catholic University of Korea (CUK)', koreaRank: 22, worldRank: '601–800' },

  { slug: 'chonnam-national-university', nameEn: 'Chonnam National University', koreaRank: 23, worldRank: '801–1000' },
  { slug: 'inha-university', nameEn: 'Inha University', koreaRank: 23, worldRank: '801–1000' },
  { slug: 'jeonbuk-national-university', nameEn: 'Jeonbuk National University', koreaRank: 23, worldRank: '801–1000' },
  { slug: 'sogang-university', nameEn: 'Sogang University', koreaRank: 23, worldRank: '801–1000' },

  { slug: 'chungbuk-national-university', nameEn: 'Chungbuk National University', koreaRank: 27, worldRank: '1001–1200' },
  { slug: 'chungnam-national-university', nameEn: 'Chungnam National University', koreaRank: 27, worldRank: '1001–1200' },
  { slug: 'university-of-seoul', nameEn: 'University of Seoul', koreaRank: 27, worldRank: '1001–1200' },

  { slug: 'gyeongsang-national-university', nameEn: 'Gyeongsang National University', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'hallym-university', nameEn: 'Hallym University', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'incheon-national-university', nameEn: 'Incheon National University', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'jeju-national-university', nameEn: 'Jeju National University', koreaRank: 30, worldRank: '1201–1500' },
  // THE ranks Kangwon as one institution; our catalogue splits it by campus, so
  // the rank lands on the main (Chuncheon) campus only.
  { slug: 'kangwon-national-university-chuncheon', nameEn: 'Kangwon National University', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'kookmin-university', nameEn: 'Kookmin University', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'pukyong-national-university', nameEn: 'Pukyong National University', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'seoul-national-university-of-science-and-technology', nameEn: 'Seoul National University of Science and Technology (SeoulTech)', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'soonchunhyang-university', nameEn: 'Soonchunhyang University', koreaRank: 30, worldRank: '1201–1500' },
  { slug: 'woosong-university', nameEn: 'Woosong University', koreaRank: 30, worldRank: '1201–1500' },

  { slug: 'chosun-university', nameEn: 'Chosun University', koreaRank: 40, worldRank: '1501+' },
  { slug: 'dankook-university', nameEn: 'Dankook University', koreaRank: 40, worldRank: '1501+' },
];
