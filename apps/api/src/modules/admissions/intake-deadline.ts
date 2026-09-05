import { IntakeStatus, ProgramLevel, ServiceType } from '../../prisma/client.js';

/**
 * The date arithmetic behind the admissions module (gksedu.md §4.1, §4.2).
 *
 * Pure on purpose — no Prisma, no clock of its own. Everything that decides
 * "is this intake still open?" or "when is this case actually due?" lives
 * here so there is exactly one answer, and so it can be unit-tested against a
 * fixed `now` (`intake-deadline.spec.ts`).
 *
 * Two dates carry the whole module and are trivial to confuse:
 *   `applicationDeadline` — the school's published last day
 *   `internalDeadline`    — ours, `internalLeadDays` earlier
 * Cases, reminders and countdowns are all driven by the internal one.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where an intake sits right now — derived from its dates, never stored.
 * Mirrored as a type in `packages/shared` for the frontend; the API does not
 * depend on that package (DTOs and Prisma are its contract).
 *
 *   `OPEN`       — we are taking registrations, and our deadline has not passed
 *   `FINAL_CALL` — our deadline passed, the school's has not: still possible,
 *                  but only on a staff decision
 *   `CLOSED`     — the school's deadline passed, or staff closed the round
 *
 * There is deliberately no "not open yet" state. `openAt` records when the
 * *school* starts accepting, which is the school's business — GKS registers a
 * client for a round any time before our own deadline, so an announced round is
 * open from the moment it is published.
 */
export type IntakePhase = 'OPEN' | 'FINAL_CALL' | 'CLOSED';

/** The Korean academic intake months (§4.1 — prep runs all four, degrees 3 and 9). */
export const INTAKE_MONTHS = [3, 6, 9, 12] as const;
export type IntakeMonth = (typeof INTAKE_MONTHS)[number];

/** The office's fallback while no `AdmissionConfig` row exists yet. */
export const DEFAULT_INTERNAL_LEAD_DAYS = 7;

/** The subset of an intake (or of an override) the date logic reads. */
export interface IntakeDateFields {
  openAt: Date | null;
  applicationDeadline: Date | null;
  internalDeadline: Date | null;
  internalDeadlineIsManual: boolean;
  classStartDate: Date | null;
}

/**
 * Our deadline, `leadDays` before the school's.
 *
 * Returns `null` when the school's date is unknown — an intake with no
 * published deadline has no internal one either, and the UI says
 * "мэдээлэл шинэчлэгдэж байна" rather than inventing a date.
 */
export function computeInternalDeadline(
  applicationDeadline: Date | null | undefined,
  leadDays: number,
): Date | null {
  if (!applicationDeadline) return null;
  return new Date(applicationDeadline.getTime() - Math.max(leadDays, 0) * DAY_MS);
}

/**
 * What `internalDeadline` should be after a write.
 *
 * A human's date always wins: once staff typed one, `isManual` is true and the
 * automatic recompute leaves the row alone for good. That is the difference
 * between "the rule says 7 days" and "this school actually wants it earlier",
 * and losing the second to a config change would be the expensive bug.
 */
export function resolveInternalDeadline(fields: {
  applicationDeadline: Date | null;
  internalDeadline: Date | null;
  internalDeadlineIsManual: boolean;
  leadDays: number;
}): Date | null {
  if (fields.internalDeadlineIsManual) return fields.internalDeadline;
  return computeInternalDeadline(fields.applicationDeadline, fields.leadDays);
}

/**
 * Merge a programme override onto its term: each date the override leaves
 * `null` falls through to the term's. `internalDeadlineIsManual` follows
 * whichever row supplied the internal deadline.
 */
export function resolveIntakeDates(
  term: IntakeDateFields,
  override?: Partial<IntakeDateFields> | null,
): IntakeDateFields {
  if (!override) return term;

  const internalFromOverride = override.internalDeadline ?? null;
  return {
    openAt: override.openAt ?? term.openAt,
    applicationDeadline: override.applicationDeadline ?? term.applicationDeadline,
    internalDeadline: internalFromOverride ?? term.internalDeadline,
    internalDeadlineIsManual: internalFromOverride
      ? (override.internalDeadlineIsManual ?? false)
      : term.internalDeadlineIsManual,
    classStartDate: override.classStartDate ?? term.classStartDate,
  };
}

/**
 * Where an intake stands right now.
 *
 * `openAt` is not consulted: we take registrations for a published round
 * whenever our own deadline is still ahead, so there is nothing to wait for.
 *
 * `PLANNED` is a draft and `CANCELLED` a scrapped round — both read as
 * `CLOSED` so nothing downstream has to special-case them. With no dates at
 * all a published round counts as `OPEN`: staff entered it deliberately, and
 * hiding it because the school has not published a deadline would be worse
 * than showing it with an unknown one.
 */
export function computeIntakePhase(
  dates: Pick<IntakeDateFields, 'applicationDeadline' | 'internalDeadline'>,
  status: IntakeStatus,
  now: Date,
): IntakePhase {
  if (status === IntakeStatus.PLANNED || status === IntakeStatus.CLOSED) return 'CLOSED';
  if (status === IntakeStatus.CANCELLED) return 'CLOSED';

  if (dates.applicationDeadline && now > dates.applicationDeadline) return 'CLOSED';
  if (dates.internalDeadline && now > dates.internalDeadline) return 'FINAL_CALL';
  return 'OPEN';
}

/** Whole days from `now` to `target`; negative once it has passed. */
export function daysUntil(target: Date | null | undefined, now: Date): number | null {
  if (!target) return null;
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}

/**
 * May a new case still be pointed at this intake?
 *
 * `FINAL_CALL` counts as selectable — our own deadline has slipped but the
 * school still accepts documents, and refusing the choice outright would take
 * a decision that belongs to the consultant. `CLOSED` does not.
 */
export function isIntakeSelectable(
  dates: Pick<IntakeDateFields, 'applicationDeadline' | 'internalDeadline'>,
  status: IntakeStatus,
  now: Date,
): boolean {
  return computeIntakePhase(dates, status, now) !== 'CLOSED';
}

/**
 * Which programme levels a service may be applied to.
 *
 * GKS covers every level — a scholarship case can target language prep or a
 * degree — so it maps to all four rather than to none (§4.3).
 */
export const SERVICE_LEVELS: Record<ServiceType, readonly ProgramLevel[]> = {
  [ServiceType.LANGUAGE_PREP]: [ProgramLevel.LANGUAGE_PREP],
  [ServiceType.BACHELOR]: [ProgramLevel.BACHELOR],
  [ServiceType.MASTER]: [ProgramLevel.MASTER],
  [ServiceType.PHD]: [ProgramLevel.PHD],
  [ServiceType.GKS_SCHOLARSHIP]: [
    ProgramLevel.LANGUAGE_PREP,
    ProgramLevel.BACHELOR,
    ProgramLevel.MASTER,
    ProgramLevel.PHD,
  ],
};

export function serviceAcceptsLevel(serviceType: ServiceType, level: ProgramLevel): boolean {
  return SERVICE_LEVELS[serviceType].includes(level);
}
