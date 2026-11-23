/**
 * The office's week, Asia/Ulaanbaatar — the one schedule both the assistant and
 * the consultation calendar (1B-30) read.
 *
 * `0` is Sunday. Hours were confirmed by the business 2026-10-09; on 2026-11-23
 * they made Saturday a full day off as well, so the office works Monday–Friday.
 * Before this file the assistant carried its own copy and offered Saturday
 * visits nobody would be in for.
 *
 * The phone is the only number the assistant may give as ours (confirmed
 * 2026-10-09). Without it in the prompt, "лавлах утас байна уу?" got a
 * plausible invented one — 7700-1123 — sent to a real person on Messenger.
 */
export const OFFICE = {
  address: 'Улаанбаатар, Төв шуудангийн урд, Eco International Tower, 17 давхар, 1707 тоот',
  phone: '7710-9000',
  hours: {
    0: null,
    1: [9, 18],
    2: [9, 18],
    3: [9, 18],
    4: [9, 18],
    5: [9, 18],
    6: null,
  } as Record<number, [number, number] | null>,
};

export const DAY_NAMES = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

/** Ulaanbaatar is UTC+8 all year — Mongolia has no daylight saving. */
export const OFFICE_UTC_OFFSET = '+08:00';

export interface OfficeClock {
  day: number;
  hour: number;
  minute: number;
}

/** The wall clock in Ulaanbaatar — a model left to work this out answers in UTC. */
export function officeClock(now: Date): OfficeClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ulaanbaatar',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));

  return { day, hour: Number(part('hour')), minute: Number(part('minute')) };
}

export const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-10-12` in Ulaanbaatar. */
export function officeDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * "Даваа–Баасан 09:00–18:00, Бямба, Ням гарагт амарна" — built from `OFFICE.hours`
 * so a change to the week cannot leave the prompt quoting the old one.
 * Consecutive days with the same hours collapse into a range.
 */
export function scheduleLine(): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { from: number; to: number; hours: [number, number] | null }[] = [];

  for (const day of order) {
    const hours = OFFICE.hours[day] ?? null;
    const last = groups.at(-1);
    if (last && String(last.hours) === String(hours)) last.to = day;
    else groups.push({ from: day, to: day, hours });
  }

  const open = groups
    .filter((group) => group.hours)
    .map((group) => {
      const days = group.from === group.to ? DAY_NAMES[group.from] : `${DAY_NAMES[group.from]}–${DAY_NAMES[group.to]}`;
      return `${days} ${pad(group.hours![0])}:00–${pad(group.hours![1])}:00`;
    });
  const closed = order.filter((day) => !OFFICE.hours[day]).map((day) => DAY_NAMES[day]);

  return closed.length ? `${open.join(', ')}, ${closed.join(', ')} гарагт амарна` : open.join(', ');
}

/**
 * Why a proposed visit or call time does not work, or null when it does.
 *
 * `date` is `YYYY-MM-DD` and `time` `HH:MM`, both Ulaanbaatar. `time` may be
 * null: the office wants people to come whenever suits them inside opening
 * hours, so a day alone is a complete answer and only has to be an open one
 * that has not already closed. The answer is a Mongolian phrase the tool hands
 * back to the model, so it can say exactly what is wrong.
 */
export function officeSlotProblem(date: string, time: string | null, now: Date = new Date()): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = time === null ? null : /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dateMatch || (time !== null && !timeMatch)) return 'огноо эсвэл цаг буруу бичигдсэн';

  const hour = timeMatch ? Number(timeMatch[1]) : 12;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const at = new Date(`${date.trim()}T${pad(hour)}:${pad(minute)}:00${OFFICE_UTC_OFFSET}`);
  if (Number.isNaN(at.getTime()) || hour > 23 || minute > 59) return 'огноо эсвэл цаг буруу бичигдсэн';

  const { day } = officeClock(at);
  const hours = OFFICE.hours[day];
  if (!hours) return `${date.trim()} бол ${DAY_NAMES[day]} гараг — оффис хаалттай`;

  if (!timeMatch) {
    const closes = new Date(`${date.trim()}T${pad(hours[1])}:00:00${OFFICE_UTC_OFFSET}`);
    return closes.getTime() <= now.getTime() ? 'тэр өдрийн ажлын цаг аль хэдийн дууссан' : null;
  }

  const minutes = hour * 60 + minute;
  if (minutes < hours[0] * 60 || minutes >= hours[1] * 60) {
    return `${DAY_NAMES[day]} гарагт оффис ${pad(hours[0])}:00–${pad(hours[1])}:00 ажиллана`;
  }

  if (at.getTime() < now.getTime()) return 'энэ цаг аль хэдийн өнгөрсөн';

  return null;
}

/**
 * Why a booked block does not fit the office's day, or null when it does —
 * the calendar's check, where `officeSlotProblem` is the assistant's.
 *
 * Unlike a visitor's wish, a block has a length, and it has to end by closing
 * time too. A past start is not refused here: staff write down a walk-in after
 * it happened.
 */
export function officeBlockProblem(startsAt: Date, durationMinutes: number): string | null {
  const { day, hour, minute } = officeClock(startsAt);
  const hours = OFFICE.hours[day];
  if (!hours) return `${DAY_NAMES[day]} гарагт оффис амарна`;

  const start = hour * 60 + minute;
  if (start < hours[0] * 60 || start + durationMinutes > hours[1] * 60) {
    return `${DAY_NAMES[day]} гарагт оффис ${pad(hours[0])}:00–${pad(hours[1])}:00 ажиллана`;
  }

  return null;
}

/** `Даваа` for a `YYYY-MM-DD` in Ulaanbaatar — what the tool repeats back, so the model cannot mislabel it. */
export function weekdayOf(date: string): string | null {
  const at = new Date(`${date.trim()}T12:00:00${OFFICE_UTC_OFFSET}`);
  return Number.isNaN(at.getTime()) ? null : DAY_NAMES[officeClock(at).day]!;
}
