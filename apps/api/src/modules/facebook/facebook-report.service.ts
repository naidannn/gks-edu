import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { changePercent } from '../reports/report-period.js';
import { count, localDay, localHour, rateOrNull, within } from '../reports/report-sql.js';
import {
  FACEBOOK_REPORT_MAX_DAYS,
  resolveFacebookPeriod,
  windowDays,
  type FacebookReportPreset,
  type FacebookReportWindow,
} from './facebook-report-period.js';

/** The leads table the report names, newest first. More is a CRM list, not a report. */
const LEAD_LIST_LIMIT = 100;

/**
 * A lead "came from Facebook" when it is tied to a thread and was made after
 * the thread opened. The second half is what keeps a person who filled in the
 * website form in August and wrote on Messenger in October from being counted
 * as an October Facebook contact: staff linking a thread to an existing lead is
 * recognition, not capture. Merged-away rows are history and count once, under
 * the lead they were merged into — which is older, so not here.
 *
 * `captured_by` is AI when the assistant's session filed it (the lead tool
 * marks its session `LEAD_CREATED`), STAFF otherwise — the «Сэжим үүсгэх»
 * button in the inbox.
 */
const FACEBOOK_LEADS_CTE = Prisma.sql`
  fb_leads AS (
    SELECT DISTINCT ON (l.id)
      l.id                                  AS lead_id,
      t.id                                  AS thread_id,
      concat_ws(' ', NULLIF(l."lastName", '—'), NULLIF(l."firstName", '—')) AS name,
      l.phone                               AS phone,
      l.stage::text                         AS stage,
      l."createdAt"                         AS created_at,
      CASE WHEN EXISTS (
        SELECT 1 FROM "chat_sessions" s WHERE s."leadId" = l.id AND s.outcome = 'LEAD_CREATED'
      ) THEN 'AI' ELSE 'STAFF' END          AS captured_by
    FROM "facebook_threads" t
    JOIN "leads" l ON l.id = t."leadId"
    WHERE l."mergedIntoId" IS NULL
      AND l."createdAt" >= t."createdAt"
    ORDER BY l.id, t."createdAt"
  )
`;

/** Each thread's first message from the person — when they first wrote to the Page. */
const FIRST_CONTACT_CTE = Prisma.sql`
  first_contact AS (
    SELECT m."threadId" AS thread_id, min(m."createdAt") AS first_at
    FROM "facebook_messages" m
    WHERE m.sender = 'CONTACT'
    GROUP BY m."threadId"
  )
`;

interface TotalsRow {
  people: number;
  new_people: number;
  leads: number;
  /** Of `leads`, how many are WON now — current stage, not stage at the time. */
  leads_won: number;
  inbound: number;
  ai_replies: number;
  staff_replies: number;
  comments: number;
}

/**
 * The Facebook Page report (2F-10): how many people wrote, how many of them
 * were new, how many left a name and number, and who answered.
 *
 * Built from the rows the inbox already keeps — `facebook_messages` is the
 * Page's whole conversation history and `facebook_threads.leadId` is the CRM
 * link — so there is no counter to drift and nothing to backfill: the report
 * reaches back to the first webhook the Page delivered.
 *
 * Not cached, unlike `/reports/*`: the question it answers is "today, so
 * far", and the tables are small. Every query is read-only, so they run
 * under one `Promise.all` (CLAUDE.md rule 9).
 */
@Injectable()
export class FacebookReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(preset: FacebookReportPreset, range: { from?: string; to?: string }) {
    if (preset === 'custom' && range.from && range.to && range.from > range.to) {
      throw new BadRequestException('Эхлэх огноо дуусах огнооноос хойш байна');
    }
    const period = resolveFacebookPeriod(preset, range);
    if (windowDays(period) > FACEBOOK_REPORT_MAX_DAYS) {
      throw new BadRequestException(`Хугацаа ${FACEBOOK_REPORT_MAX_DAYS} хоногоос урт байж болохгүй`);
    }

    const [current, previous, days, hours, sources, staff, leadList, replies] = await Promise.all([
      this.totals(period.from, period.to),
      this.totals(period.previousFrom, period.previousTo),
      this.days(period),
      this.hours(period),
      this.sources(period),
      this.staff(period),
      this.leadList(period),
      this.firstReplies(period),
    ]);

    const metric = (key: Exclude<keyof TotalsRow, 'leads_won'>) => {
      const value = count(current[key]);
      const before = count(previous[key]);
      return { value, previous: before, changePercent: changePercent(value, before) };
    };

    const newPeople = count(current.new_people);
    const leads = count(current.leads);

    return {
      period,
      generatedAt: new Date().toISOString(),
      totals: {
        people: metric('people'),
        newPeople: metric('new_people'),
        leads: metric('leads'),
        inbound: metric('inbound'),
        aiReplies: metric('ai_replies'),
        staffReplies: metric('staff_replies'),
        comments: metric('comments'),
      },
      leadRate: rateOrNull(leads, newPeople),
      leadsWon: count(current.leads_won),
      firstReplyMedianMinutes: replies.median === null ? null : Math.round(Number(replies.median) * 10) / 10,
      newUnanswered: count(replies.unanswered),
      days,
      hours,
      sources,
      staff,
      leadList,
    };
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  private async totals(from: string, to: string): Promise<TotalsRow> {
    const [row] = await this.prisma.$queryRaw<TotalsRow[]>`
      WITH ${FACEBOOK_LEADS_CTE}, ${FIRST_CONTACT_CTE}
      SELECT
        (SELECT count(DISTINCT m."threadId")::int FROM "facebook_messages" m
          WHERE m.sender = 'CONTACT' AND ${within(Prisma.sql`m."createdAt"`, from, to)}) AS people,
        (SELECT count(*)::int FROM first_contact f
          WHERE ${within(Prisma.sql`f.first_at`, from, to)})                             AS new_people,
        (SELECT count(*)::int FROM fb_leads fl
          WHERE ${within(Prisma.sql`fl.created_at`, from, to)})                          AS leads,
        (SELECT count(*)::int FROM fb_leads fl
          WHERE fl.stage = 'WON' AND ${within(Prisma.sql`fl.created_at`, from, to)})     AS leads_won,
        (SELECT count(*)::int FROM "facebook_messages" m
          WHERE m.sender = 'CONTACT' AND ${within(Prisma.sql`m."createdAt"`, from, to)}) AS inbound,
        (SELECT count(*)::int FROM "facebook_messages" m
          WHERE m.sender = 'AI' AND m.status = 'SENT'
            AND ${within(Prisma.sql`m."createdAt"`, from, to)})                          AS ai_replies,
        (SELECT count(*)::int FROM "facebook_messages" m
          WHERE m.sender IN ('STAFF', 'PAGE') AND m.status = 'SENT'
            AND ${within(Prisma.sql`m."createdAt"`, from, to)})                          AS staff_replies,
        (SELECT count(*)::int FROM "facebook_comments" c
          WHERE ${within(Prisma.sql`c."createdAt"`, from, to)})                          AS comments
    `;
    return row!;
  }

  /**
   * One row per office-local day of the window, zero-filled — a day nobody
   * wrote is a bar of height zero, not a missing bar.
   */
  private async days(period: FacebookReportWindow) {
    const rows = await this.prisma.$queryRaw<
      { day: string; people: number; new_people: number; leads: number; messages: number }[]
    >`
      WITH ${FACEBOOK_LEADS_CTE}, ${FIRST_CONTACT_CTE},
      calendar AS (
        SELECT generate_series(CAST(${period.from} AS date), CAST(${period.to} AS date) - 1, interval '1 day')::date AS day
      ),
      inbound AS (
        SELECT ${localDay(Prisma.sql`m."createdAt"`)} AS day,
               count(DISTINCT m."threadId")::int AS people,
               count(*)::int AS messages
        FROM "facebook_messages" m
        WHERE m.sender = 'CONTACT' AND ${within(Prisma.sql`m."createdAt"`, period.from, period.to)}
        GROUP BY 1
      ),
      firsts AS (
        SELECT ${localDay(Prisma.sql`f.first_at`)} AS day, count(*)::int AS n
        FROM first_contact f
        WHERE ${within(Prisma.sql`f.first_at`, period.from, period.to)}
        GROUP BY 1
      ),
      captured AS (
        SELECT ${localDay(Prisma.sql`fl.created_at`)} AS day, count(*)::int AS n
        FROM fb_leads fl
        WHERE ${within(Prisma.sql`fl.created_at`, period.from, period.to)}
        GROUP BY 1
      )
      SELECT to_char(c.day, 'YYYY-MM-DD')    AS day,
             COALESCE(i.people, 0)::int      AS people,
             COALESCE(f.n, 0)::int           AS new_people,
             COALESCE(l.n, 0)::int           AS leads,
             COALESCE(i.messages, 0)::int    AS messages
      FROM calendar c
      LEFT JOIN inbound i  ON i.day = c.day
      LEFT JOIN firsts f   ON f.day = c.day
      LEFT JOIN captured l ON l.day = c.day
      ORDER BY c.day
    `;
    return rows.map((row) => ({
      day: row.day,
      people: count(row.people),
      newPeople: count(row.new_people),
      leads: count(row.leads),
      messages: count(row.messages),
    }));
  }

  /** When people write, by office hour — the shape that says when somebody should be at the inbox. */
  private async hours(period: FacebookReportWindow): Promise<number[]> {
    const rows = await this.prisma.$queryRaw<{ hour: number; n: number }[]>`
      SELECT ${localHour(Prisma.sql`m."createdAt"`)} AS hour, count(*)::int AS n
      FROM "facebook_messages" m
      WHERE m.sender = 'CONTACT' AND ${within(Prisma.sql`m."createdAt"`, period.from, period.to)}
      GROUP BY 1
    `;
    const hours = Array.from({ length: 24 }, () => 0);
    for (const row of rows) hours[count(row.hour)] = count(row.n);
    return hours;
  }

  /**
   * How the period's new people reached the Page, from the thread's first-touch
   * referral: a click-to-Messenger ad carries `ad_id` (or `source: ADS`), a
   * private reply to a post comment opened the thread from the comment, any
   * other referral is an m.me link or a QR code, and no referral at all is
   * somebody who just pressed «Message».
   */
  private async sources(period: FacebookReportWindow) {
    const rows = await this.prisma.$queryRaw<{ source: string; n: number }[]>`
      WITH ${FIRST_CONTACT_CTE}
      SELECT
        CASE
          WHEN t.referral->>'ad_id' IS NOT NULL OR t.referral->>'source' = 'ADS' THEN 'AD'
          WHEN EXISTS (SELECT 1 FROM "facebook_comments" c WHERE c."threadId" = t.id) THEN 'COMMENT'
          WHEN t.referral IS NOT NULL THEN 'LINK'
          ELSE 'DIRECT'
        END AS source,
        count(*)::int AS n
      FROM first_contact f
      JOIN "facebook_threads" t ON t.id = f.thread_id
      WHERE ${within(Prisma.sql`f.first_at`, period.from, period.to)}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    return rows.map((row) => ({ source: row.source as 'AD' | 'COMMENT' | 'LINK' | 'DIRECT', count: count(row.n) }));
  }

  /**
   * Replies people delivered, by person. `PAGE` echoes — somebody typing in
   * Business Suite or the Facebook app — have no staff id and are one row.
   */
  private async staff(period: FacebookReportWindow) {
    const rows = await this.prisma.$queryRaw<
      { staff_id: string | null; name: string | null; email: string | null; replies: number; threads: number }[]
    >`
      SELECT m."staffId"                      AS staff_id,
             u.name                           AS name,
             u.email                          AS email,
             count(*)::int                    AS replies,
             count(DISTINCT m."threadId")::int AS threads
      FROM "facebook_messages" m
      LEFT JOIN "users" u ON u.id = m."staffId"
      WHERE m.sender IN ('STAFF', 'PAGE') AND m.status = 'SENT'
        AND ${within(Prisma.sql`m."createdAt"`, period.from, period.to)}
      GROUP BY 1, 2, 3
      ORDER BY 4 DESC
    `;
    return rows.map((row) => ({
      staffId: row.staff_id,
      name: row.staff_id ? (row.name ?? row.email ?? 'Ажилтан') : 'Business Suite / Facebook app',
      replies: count(row.replies),
      threads: count(row.threads),
    }));
  }

  private async leadList(period: FacebookReportWindow) {
    const rows = await this.prisma.$queryRaw<
      { lead_id: string; thread_id: string; name: string; phone: string; stage: string; captured_by: string; created_at: Date }[]
    >`
      WITH ${FACEBOOK_LEADS_CTE}
      SELECT * FROM fb_leads fl
      WHERE ${within(Prisma.sql`fl.created_at`, period.from, period.to)}
      ORDER BY fl.created_at DESC
      LIMIT ${Prisma.raw(String(LEAD_LIST_LIMIT))}
    `;
    return rows.map((row) => ({
      leadId: row.lead_id,
      threadId: row.thread_id,
      name: row.name || '—',
      phone: row.phone,
      stage: row.stage,
      capturedBy: row.captured_by as 'AI' | 'STAFF',
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * For each person who first wrote in the period: minutes until the first
   * reply anybody delivered — the assistant, staff, or Business Suite. The
   * median, because one thread answered the next morning should not make the
   * whole week look slow; and the ones with no reply at all, counted apart,
   * because a median cannot see them.
   */
  private async firstReplies(period: FacebookReportWindow) {
    const [row] = await this.prisma.$queryRaw<{ median: number | null; unanswered: number }[]>`
      WITH ${FIRST_CONTACT_CTE},
      replied AS (
        SELECT f.thread_id,
               (SELECT min(r."createdAt") FROM "facebook_messages" r
                 WHERE r."threadId" = f.thread_id AND r.sender <> 'CONTACT'
                   AND r.status = 'SENT' AND r."createdAt" >= f.first_at) AS reply_at,
               f.first_at
        FROM first_contact f
        WHERE ${within(Prisma.sql`f.first_at`, period.from, period.to)}
      )
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (reply_at - first_at)) / 60.0)::float8 AS median,
        count(*) FILTER (WHERE reply_at IS NULL)::int AS unanswered
      FROM replied
    `;
    return row ?? { median: null, unanswered: 0 };
  }
}
