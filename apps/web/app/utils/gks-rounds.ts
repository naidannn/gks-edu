import { DAY_IN_MS } from './admissions';

/**
 * The GKS rounds the public pages count down to — "одоо бакалаврын элсэлт авч
 * байна", with the clock running.
 *
 * GKS is not an `IntakeTerm`: it is NIIED's calendar, not a school's, so its
 * dates live here, once, transcribed from the year's guidelines. Every date is
 * an instant in KST (`+09:00`), so a round closing at 18:00 KST is 17:00 in
 * Ulaanbaatar — a countdown to the wrong hour is worse than none.
 *
 * A round is one thing a visitor can act on today, not one of NIIED's
 * administrative routes. The two bachelor routes used to sit here as two
 * rounds; the embassy one is closed for 2027 and its card said nothing anybody
 * could still do, so what is left is simply "бакалаврын элсэлт", with our own
 * deadline on it. The word "шугам" is deliberately out of this file: it is
 * internal vocabulary, and nobody arrives asking which line they are in.
 *
 * The phase is computed from the clock rather than written down, so the page
 * cannot go on saying "open" after a round has closed. What does need a hand
 * each year is this list: when the last round below is CLOSED, the next year's
 * guidelines are out and belong here.
 */

export type GksRoundDegree = 'BACHELOR' | 'GRADUATE';
export type GksRoundPhase = 'UPCOMING' | 'OPEN' | 'CLOSED';

export interface GksRound {
  id: string;
  degree: GksRoundDegree;
  degreeLabel: string;
  track: string;
  /** One line on who applies where. */
  summary: string;
  opensAt: string;
  closesAt: string;
  /**
   * Whether the clock may tick down to `closesAt`. Only ever true where that
   * date is one we stand behind — a round whose schools each close on their own
   * day gets no clock, because counting to the last possible one would tell
   * people they have longer than their school gives them.
   */
  countdown: boolean;
  /**
   * The dates are last year's pattern, not a published announcement — shown as
   * "~N хоног", never as a ticking clock with seconds.
   */
  estimated: boolean;
  /** The application window as the visitor reads it. */
  window: string;
  /** What happens once the window has closed. */
  afterClose: string;
  to: string;
}

export const GKS_ROUNDS: GksRound[] = [
  {
    id: 'bachelor-uic-2027',
    degree: 'BACHELOR',
    degreeLabel: 'Бакалавр',
    track: 'Их сургуулиар дамжуулан мэдүүлэх',
    summary: 'Материалаа сонгосон их сургууль руугаа шууд өгнө — бид бүрдүүлэлтийг нь хөтөлнө.',
    opensAt: '2026-09-01T00:00:00+09:00',
    /**
     * Ours, not a school's. The schools themselves close one by one into
     * November, but translation, notarisation and postage live in the weeks
     * before that — so the only date on the page is the one we can still
     * deliver a complete application from.
     */
    closesAt: '2026-10-15T18:00:00+09:00',
    countdown: true,
    estimated: false,
    window: 'Эцсийн хугацаа: 10.15, 17:00 (УБ цагаар)',
    afterClose: '2-р шатны хариу 12 сарын дунд, эцсийн жагсаалт 2027.01.07.',
    to: '/gks-2027',
  },
  {
    id: 'graduate-2027',
    degree: 'GRADUATE',
    degreeLabel: 'Магистр · Доктор',
    track: 'Магистр, докторын элсэлт',
    summary: 'Судалгааны төлөвлөгөө, зөвлөмж, орчуулгаа одооноос бэлдэх нь давуу.',
    opensAt: '2027-02-01T00:00:00+09:00',
    closesAt: '2027-03-31T18:00:00+09:00',
    countdown: false,
    estimated: true,
    window: '2027 оны 2 – 3 сар (урьдчилсан)',
    afterClose: 'Шалгаруулалт 4 – 6 сард, эцсийн хариу 6 – 7 сард.',
    to: '/consultation?service=GKS_SCHOLARSHIP',
  },
];

export function getGksRoundPhase(round: GksRound, now: number): GksRoundPhase {
  if (now < new Date(round.opensAt).getTime()) return 'UPCOMING';
  if (now < new Date(round.closesAt).getTime()) return 'OPEN';
  return 'CLOSED';
}

/**
 * Whole days until `iso`, rounded down — the same number the ticking clock's
 * ХОНОГ box shows, so the sentence beside it never says one day more.
 */
export function gksDaysUntil(iso: string, now: number): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / DAY_IN_MS));
}

/**
 * The rounds in the order a visitor should meet them: what is open now (the
 * one closing first leads), then what opens next, then what has just closed.
 */
export function sortGksRounds(rounds: GksRound[], now: number): GksRound[] {
  const rank: Record<GksRoundPhase, number> = { OPEN: 0, UPCOMING: 1, CLOSED: 2 };
  return rounds.toSorted((a, b) => {
    const byPhase = rank[getGksRoundPhase(a, now)] - rank[getGksRoundPhase(b, now)];
    if (byPhase) return byPhase;
    // A round with a real countdown beats one closing "some time in November".
    if (a.countdown !== b.countdown) return a.countdown ? -1 : 1;
    return new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime();
  });
}

/** The round the page leads with: open with a real countdown, else simply the first. */
export function featuredGksRound(rounds: GksRound[], now: number): GksRound | null {
  const sorted = sortGksRounds(rounds, now);
  return sorted.find((round) => round.countdown && getGksRoundPhase(round, now) === 'OPEN') ?? sorted[0] ?? null;
}

/** The status pill, in the words that make somebody act. */
export function gksRoundHeadline(round: GksRound, now: number): string {
  const phase = getGksRoundPhase(round, now);
  const degree = round.degree === 'BACHELOR' ? 'бакалаврын' : 'магистр, докторын';
  if (phase === 'OPEN') return `Одоо ${degree} элсэлт авч байна`;
  if (phase === 'UPCOMING') {
    const days = gksDaysUntil(round.opensAt, now);
    return round.estimated
      ? `${round.degreeLabel} — ~${days} хоногийн дараа нээгдэнэ`
      : `${round.degreeLabel} — ${days} хоногийн дараа нээгдэнэ`;
  }
  return `${round.degreeLabel} — бүртгэл хаагдсан`;
}

/**
 * The home-page quick check: the two hard floors every GKS application meets
 * first (age, grade). Only a first answer — the full picture is `/gks-check`.
 */
export type GksQuickVerdict = 'OK' | 'AGE' | 'GPA' | 'BOTH';

export const GKS_AGE_LIMIT: Record<GksRoundDegree, number> = { BACHELOR: 25, GRADUATE: 40 };
export const GKS_GPA_FLOOR = 80;

export function gksQuickVerdict(degree: GksRoundDegree, age: number, gpaPercent: number): GksQuickVerdict {
  const ageOk = age < GKS_AGE_LIMIT[degree];
  const gpaOk = gpaPercent >= GKS_GPA_FLOOR;
  if (ageOk && gpaOk) return 'OK';
  if (!ageOk && !gpaOk) return 'BOTH';
  return ageOk ? 'GPA' : 'AGE';
}
