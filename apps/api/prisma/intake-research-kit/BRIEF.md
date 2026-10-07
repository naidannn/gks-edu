# Intake research brief (GKSedu.mn, task 1H-12)

Today is the date your session reports (the first run was 2026-10-08; replace that date in
`researchedAt` and in the cut-off below with today's). You are researching Korean universities' admission rounds **for foreign
(international, 외국인) students** from the schools' OWN websites, and writing one JSON file per
school. You do NOT touch any database, git, or deploy. You only write files under
`/Users/user/amarhan/projects/gks-edu/apps/api/prisma/data/intake-research/`.

## Read first (examples of finished files — match them exactly)
- `apps/api/prisma/data/intake-research/konkuk-university.json`
- `apps/api/prisma/data/intake-research/sogang-university.json`
- `apps/api/prisma/data/intake-research/postech.json`
- The validator + field docs: `apps/api/prisma/import-intakes.ts` (interfaces `ResearchRound`, `ResearchFile`, function `validate`).

## What to find, per school, per level
Levels: `LANGUAGE_PREP` (한국어교육원/어학당/언어교육원 정규과정, D-4), `BACHELOR` (학부 외국인 특별전형/
외국인전형 신입학), `MASTER` and `PHD` (대학원 외국인 특별전형 / 외국인전형, 일반대학원).
Rounds wanted (named by the month classes start): `2026/12` (language prep only),
`2027/3`, `2027/6` (language prep only), `2027/9`.

**Only write a round into `rounds` if the school's own last day (`applicationDeadline`) is on or
after 2026-10-09.** Rounds already closed are noted in `pending` (reason: "хаагдсан …"),
not in `rounds`. Rounds not yet published go in `pending` with where to check again.
Levels the school does not run for foreigners go in `notOffered`.

Fields: `openAt`, `applicationDeadline` (REQUIRED; the end of online application / 원서접수 —
if documents have a later separate deadline, still use the 원서접수 end and mention the document
date in `requirementNote`), `classStartDate` (개강), `resultAnnouncedAt` (합격자 발표), `quota`,
`admissionFeeKrw` (전형료 = application fee, integer KRW; NOT 입학금/tuition), `requirementNote`,
`sourceUrl` (REQUIRED: the exact page/PDF you read the dates on), `evidence` (verbatim Korean/English
line(s) from the source), `confidence` (`HIGH` only if read from the school's official page for
that exact round).
If one intake has several rounds (1차/2차), store the **first round still open** and put the other
in `laterRounds`.

## Mongolia-specific rules (important to this business — we send Mongolian students)
- If a school publishes a separate, earlier deadline for Mongolia (often grouped with Nepal,
  Myanmar, Bangladesh, Vietnam "countries taking longer for visas"), use THAT date as
  `applicationDeadline` and say so in `requirementNote`.
- Any rule aimed at Mongolian applicants (higher TOPIK, minimum number of terms, earlier
  application, interview, extra financial proof) goes in `requirementNote` and in your report.

## Smaller schools
Many of these schools are less well known: their international pages may be under
국제교류처 / 국제처 / 국제교육원 / 대외협력처 / global.<domain>, or the guide is on the school's
입학처 notice board (공지사항) as an attachment. A school may not admit foreigners to a degree
level at all (e.g. no graduate school for foreigners) — then `notOffered`. A school that has only
a Glocal/branch campus page: research that campus only if the slug is that campus.

## Hard rules
- Sources must be the school's official domains (*.ac.kr, the school's own admission/application
  sites such as uwayapply/jinhakapply notice pages linked from them). Third-party agencies, blogs,
  StudyU, Instagram, scribd: use only as hints to find the official page, never as `sourceUrl`.
  If only a third-party source exists, do not write the round — put it in `pending`.
- Never guess or carry a date over from last year. `null` beats a guess.
- `requirementNote` and `note` are **public, client-facing, in Mongolian (Cyrillic)**, short and
  factual (language requirement such as TOPIK level / English score, interview, document mailing
  deadline). Never put provenance, doubt, "AI", "эх сурвалж", "таамагласан" in them. Leave
  `note` out unless there is a client-relevant fact.
- `pending[].reason` is in **Mongolian**.
- Dates `YYYY-MM-DD`. `month` must be 3/6/9/12 for LANGUAGE_PREP, 3/9 for degrees.
- File name = `<slug>.json`, `slug` field identical, `researchedAt: "2026-10-08"`.

## Tools / how
- Discover with the WebSearch tool (Korean queries work best, e.g.
  `연세대학교 2027학년도 1학기 외국인 신입학 모집요강`, `○○대학교 대학원 2027 전기 외국인 특별전형 원서접수`,
  `○○대학교 한국어학당 2027 봄학기 지원 기간`). Load it via ToolSearch `select:WebSearch,WebFetch`.
- Read pages/PDFs with the helper (handles HTML and text PDFs, Korean encodings):
  `/Users/user/amarhan/projects/gks-edu/apps/api/prisma/intake-research-kit/fetch.sh "<url>" <short-name>`
  → text lands in `${RESEARCH_TMP:-/tmp/intake-research}/<short-name>.txt`; grep it for 원서접수 / 접수기간 / 전형료 / 합격자 발표 / 개강.
  Prefix your short-names with your agent letter to avoid collisions (e.g. `a-snu-grad`).
  A PDF that extracts to empty text is image-only: find another official page for it, or `pending`.
- Do NOT use the Chrome browser tools (other agents share it).
- Budget: about 15–25 tool calls per school; if a level is not findable in that budget, `pending`.

## Validate before you finish
From `/Users/user/amarhan/projects/gks-edu/apps/api` run:
`DATABASE_URL=postgresql://x:x@127.0.0.1:1/x pnpm exec tsx prisma/import-intakes.ts --dry --only <slug1>,<slug2>`
A validation error prints as `<file>: <message>` — fix it. A connection error (ECONNREFUSED) AFTER
that means validation passed; that is expected.

## Report back (short)
Per school: rounds written (level year/month, school deadline), pending items, and anything
surprising (e.g. a page contradicting itself). Under 200 words total.
