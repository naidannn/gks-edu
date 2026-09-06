#!/usr/bin/env node
/**
 * Roadmap progress. Parses docs/TASKS.md (open work) and docs/TASKS-DONE.md (the
 * archive) — the table rows are the source of truth, so a status only changes by
 * editing those files. Epics are merged by heading, TASKS.md fixing the order.
 *
 *   pnpm tasks            # every epic
 *   pnpm tasks 1D         # one epic, listing its open tasks
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const FILES = ['TASKS.md', 'TASKS-DONE.md'].map((f) => join(DOCS, f));

const STATUSES = ['done', 'review', 'wip', 'todo', 'blocked', 'deferred'];
// Status column 3 of `| `ID` | title | status | ... |`.
const ROW = /^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*(\w+)\s*\|/;

const c = process.stdout.isTTY
  ? { dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', red: '\x1b[31m', reset: '\x1b[0m' }
  : new Proxy({}, { get: () => '' });

const COLOR = { done: c.green, review: c.blue, wip: c.yellow, todo: c.dim, blocked: c.red, deferred: c.dim };

// TASKS.md is read first so the open-work file fixes the order epics print in;
// TASKS-DONE.md then merges its rows into the epic of the same name.
const byName = new Map();
for (const file of FILES) {
  let current = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const name = heading[1].replace(/[`*]/g, '');
      current = byName.get(name);
      if (!current) byName.set(name, (current = { name, tasks: [] }));
      continue;
    }
    const row = line.match(ROW);
    if (!row || !current) continue;
    const [, id, title, status] = row;
    if (!STATUSES.includes(status)) continue;
    current.tasks.push({ id, title, status });
  }
}
const epics = [...byName.values()];

const filter = process.argv[2]?.toUpperCase();
const shown = filter ? epics.filter((e) => e.tasks.some((t) => t.id.toUpperCase().startsWith(filter))) : epics;

const bar = (done, total, width = 24) => {
  const filled = total ? Math.round((done / total) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

const totals = Object.fromEntries(STATUSES.map((s) => [s, 0]));

console.log('');
for (const epic of shown) {
  if (!epic.tasks.length) continue;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const t of epic.tasks) counts[t.status]++;
  for (const s of STATUSES) totals[s] += counts[s];

  const active = epic.tasks.filter((t) => t.status !== 'deferred').length;
  const done = counts.done;
  const pct = active ? Math.round((done / active) * 100) : 0;

  console.log(`${c.bold}${epic.name}${c.reset}`);
  console.log(`  ${bar(done, active)} ${String(pct).padStart(3)}%  ${done}/${active}` +
    STATUSES.filter((s) => s !== 'done' && counts[s]).map((s) => `  ${COLOR[s]}${s} ${counts[s]}${c.reset}`).join(''));

  if (filter) {
    for (const t of epic.tasks.filter((t) => t.status !== 'done')) {
      console.log(`    ${COLOR[t.status]}${t.status.padEnd(8)}${c.reset} ${c.bold}${t.id}${c.reset}  ${t.title}`);
    }
  }
  console.log('');
}

const active = STATUSES.filter((s) => s !== 'deferred').reduce((n, s) => n + totals[s], 0);
console.log(`${c.bold}НИЙТ${c.reset}  ${bar(totals.done, active, 32)} ${Math.round((totals.done / active) * 100)}%  ` +
  `${totals.done}/${active} дууссан` +
  STATUSES.filter((s) => s !== 'done' && totals[s]).map((s) => `  ·  ${COLOR[s]}${s} ${totals[s]}${c.reset}`).join(''));
console.log('');
