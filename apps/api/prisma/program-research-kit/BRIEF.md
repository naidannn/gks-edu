# Programme research brief (GKSedu.mn, task 1I-10)

Read `PLAN.md` beside this file first (Mongolian; §2 is how Korean schools publish, §8 is what the
pilot taught). You research one school's **faculties, programmes, tuition and scholarships for
foreign (외국인) students** from the school's OWN websites and write one JSON file. You do NOT
touch any database, git, or deploy. You only write
`/Users/user/amarhan/projects/gks-edu/apps/api/prisma/data/program-research/<slug>.json`.

## Match the finished example exactly
- `apps/api/prisma/data/program-research/korea-university.json` — **do not Read it whole**: it is
  ~175 KB (60–80k tokens) and the shape repeats. Read a sample instead:
  `jq '{slug, researchedAt, tuitionTables: .tuitionTables[:3], faculties: .faculties[:3], programs: [.programs[0], .programs[60], .programs[-1]], scholarships: .scholarships[:2], excluded, pending}' apps/api/prisma/data/program-research/korea-university.json`
- Field docs + validator: `apps/api/prisma/import-programs.ts` (`ResearchFile`, `validate`).
- The Grep tool skips `apps/api/prisma/data/` (see the `.ignore` there). To search research files,
  use `rg --no-ignore <term> apps/api/prisma/data` in Bash.

## Scope, per school
- `BACHELOR`: every 모집단위 in the 외국인 특별전형 (신입학) 모집요강 → faculty (대학/학부) + programme.
- `MASTER` / `PHD`: every department of the **일반대학원** open to foreigners (one row per level
  the department runs). Skip 특수/전문대학원, 계약학과 and other campuses (they are separate slugs)
  — list what you skipped in `excluded`.
- `LANGUAGE_PREP`: one row, `nameKo: "한국어교육원 정규과정"`, `nameMn: "Солонгос хэлний бэлтгэл"`.
- Start from the 모집요강 already found by the intake research:
  `apps/api/prisma/data/intake-research/<slug>.json` → `sourceUrl` / `pending[].checkUrl`.

## Tuition
- Write the fee tables once in `tuitionTables` (level × 계열 group, **per semester**, KRW) and point
  every programme at its `tuitionGroup`. Use the figure **foreign students** pay (international
  office page or 모집요강); the domestic 등록금 일람표 is only for mapping departments to groups.
- `admissionFeeKrw` = 입학금 (0 for bachelor where abolished; null when the page says nothing).
  전형료 (application fee) is NOT 입학금.
- `tuitionYear` = the table's academic year. No year on the page → `null`.
- A department whose group you cannot place → `tuitionGroup: null` and a `pending` entry. Never guess.

## Scholarships
- One entry per published rule in `scholarships` (levels, optional `groups`, percent, semesters,
  criteria, sourceUrl, evidence). Mark `headline: true` on the rule an ordinary good admitted
  student can get; that percent becomes `scholarshipMaxPercent`. Give headline rules a short
  Mongolian `noteMn` that also mentions the 100% top tier and how long it lasts. GKS is out of scope.

## Public text — Mongolian, no provenance
`nameMn`, faculty `nameMn` ("… танхим"), `otherRequirements`, `noteMn` are shown to clients: plain
Mongolian Cyrillic, never "AI", "эх сурвалж", "таамагласан". `nameKo` exactly as the school writes it.
`pending[].reason` and `excluded[].reason` are Mongolian for the office.

## Hard rules
- Sources: the school's official domains only (*.ac.kr and the school's own application sites).
  Agencies, blogs, Wikipedia, StudyU: hints only, never `sourceUrl`.
- `null` beats a guess. Never carry a number over from a previous year.

## Tools
- Find with WebSearch (Korean queries: `○○대학교 2027 외국인 특별전형 모집요강`,
  `○○대학교 일반대학원 등록금 2026`, `○○대학교 외국인 장학금`). Load via ToolSearch `select:WebSearch`.
- Read with `../intake-research-kit/fetch.sh "<url>" <prefix>-<name>` (see that kit's README for the
  venv). A list that comes back empty is usually loaded by JavaScript: find the page's `$.post` /
  `fetch` endpoint in the raw HTML and `curl` it.
- **Image-only / scanned PDF, or a table whose blank cells vanished in the text** (석사 vs 박사
  columns, ○/● marks, a fee table scrambled across rows, a percent printed inside a picture): the
  raw download stays in `/tmp/intake-research/raw-<name>`. Render the pages and look at them with
  the Read tool: `swift ../intake-research-kit/pdfimg.swift /tmp/intake-research/raw-<name> <first> <last> $TMPDIR/<name>`
  → `<name>-<n>.png` (1-based pages, 2x; pages are large, render only the ones you need). A `.png`/`.jpg`
  linked from a school page: `curl` it and Read it the same way. Do not infer a cell from its neighbours.
- Do NOT use the Chrome browser tools.

## Validate before you finish
From `/Users/user/amarhan/projects/gks-edu/apps/api`:
`DATABASE_URL=postgresql://x:x@127.0.0.1:1/x pnpm exec tsx prisma/import-programs.ts --dry --only <slug>`
"1 файл зөв." followed by a connection error means validation passed.

## Report back (under 200 words)
Counts per level, fee groups found, headline scholarship per level, pending and excluded items,
anything Mongolia-specific.
