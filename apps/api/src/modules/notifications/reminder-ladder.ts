/**
 * Which rung of a reminder ladder a deadline has reached.
 *
 * A ladder like `[7, 3, 1]` is three reminders — a week out, three days out,
 * and the day before — and the rung is what the notification's `dedupeSubject`
 * is built from. That makes picking the right one load-bearing: choose the
 * *widest* rung that still matches and the first sweep sends "7", every later
 * sweep re-derives "7", collides on the unique dedupe key, and the ladder
 * silently collapses into a single reminder a week early. So this returns the
 * **tightest** rung `daysLeft` has reached.
 *
 * Ladders are written newest-deadline-last for readability (`[7, 3, 1]`), so
 * the order they are declared in must not decide the answer: sort first.
 *
 * A deadline already past maps to the tightest rung there is, which the client
 * has normally been sent already — that is the intent. Being late is not a new
 * reminder every night, it is the last reminder standing.
 *
 * @param offsets Days before the deadline, in any order.
 * @param daysLeft Whole days remaining; zero or negative once the date is here.
 * @returns The rung reached, or `undefined` when the deadline is still further
 *          out than the widest one.
 */
export function reminderOffsetFor(offsets: readonly number[], daysLeft: number): number | undefined {
  return [...offsets].sort((a, b) => a - b).find((candidate) => daysLeft <= candidate);
}
