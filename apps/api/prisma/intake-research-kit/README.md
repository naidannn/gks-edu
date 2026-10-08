# Intake research kit (1H-12)

The tools and the brief for filling `IntakeTerm` from the universities' own websites. The
research output lives in `../data/intake-research/<slug>.json`, and the database is written only
by `pnpm intakes:import` (`../import-intakes.ts`).

## Үргэлжлүүлэх заавар (Монгол)

**Төлөв (2026-10-08):** 96 сургууль судлагдсан (топ 20 + Sogang + G01-G15); 39 сургууль
үлдсэн (`groups.txt`-ийн G16-аас цааш). Тав дахь давалгаа (G13-G15) 18 шинэ элсэлт нэмсэн;
15 сургуулийн 8 нь зөвхөн `pending` (сайт нээгддэггүй, cookie шалгалттай, домэйн нээгдэхгүй,
эсвэл 2027-ийн журам гараагүй — Inje-ийн `oia.inje.ac.kr`-ийг хөтөчөөр гараар шалгах хэрэгтэй).
Яг хамрах хүрээний хувийг `/admin/universities/progress` хуудсаас шалгана.

**Шинэ chat-д үргэлжлүүлэхдээ** доорх текстийг хуулж өгнө:

> Элсэлтийн судалгааг (1H-12) үргэлжлүүл. `apps/api/prisma/intake-research-kit/README.md`-г
> уншаад `groups.txt`-ийн дараагийн бүлгүүдийг Sonnet агентуудаар 3-аар нь судлуул. Давалгаа
> бүрийн дараа файлуудыг хянаж, production дээр `--dry` хийгээд импортлоорой.

**Шийдвэрлэгдсэн зүйлс (дахин асуух шаардлагагүй):**
- AI-ийн судалсан элсэлт admin-ий зөвшөөрөлгүйгээр шууд **OPEN** болж нийтэд гарна.
- Admin хуудсанд л "AI судалсан" тэмдэг харагдана. Нийтэд хэзээ ч харагдахгүй.
- Нийтэд гарах тайлбар бүгд монгол хэлээр бичигдэнэ (импорт шалгана).
- Оффисын баталгаажуулсан мөрийг импорт хөндөхгүй. Зөрүүтэй огноог зөвхөн тайлагнана.
- Зарим сургууль Монголын иргэдэд тусдаа, эрт хугацаа тавьдаг (SKKU, Chung-Ang). Тэр огноог авна.

**Хэрэглээ хэмнэх:** агентуудыг Sonnet загвараар (`model: "sonnet"`), нэг удаад 3-аар ажиллуулна.
Opus дээр нэг сургууль ~$1.3, ~45k токен зарцуулсан. Pro багцын 5 цагийн хязгаарт ойртвол зогсоно.

## Running a wave (for the coding agent)

1. Pick the next groups from `groups.txt` (23 groups of 5, `G01` first; skip slugs that already
   have a file in `../data/intake-research/`). The Kangwon campuses (`kangwon-national-university-*`)
   belong in one agent: one admissions office covers them all.
2. Spawn one `general-purpose` agent per group, `model: "sonnet"`, three at a time. Prompt:
   "Read and follow `apps/api/prisma/intake-research-kit/BRIEF.md`. Your schools: <slug | 한국어
   이름 | site> × 5. Use the fetch.sh short-name prefix `gNN-`. Write one JSON per school, validate,
   report under 200 words including Mongolia-specific rules."
3. Review the files (open the `evidence` of anything odd), then
   `./deploy/migrate.sh -- pnpm exec tsx prisma/import-intakes.ts --dry` and, if clean, the same
   without `--dry`. Run one tunnel at a time — `migrate.sh` binds port 55432.
4. Rounds whose school deadline is today or past are not worth importing; move them to `pending`.

### Setting up the reader

`fetch.sh` needs a Python venv with `pypdf`:

```bash
python3 -m venv /tmp/intake-research/venv && /tmp/intake-research/venv/bin/pip install pypdf
```

Override the locations with `RESEARCH_TMP` / `RESEARCH_VENV`. Image-only PDFs extract to
empty text — find another official page or leave the round `pending`.

### Why not Chrome

The Claude-in-Chrome extension is denied page reads on the university domains, and parallel
agents would fight over one browser's tabs. Search with WebSearch, read with `fetch.sh`.
