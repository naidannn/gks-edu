# Programme research kit (1I-10)

Filling `Faculty` + `UniversityProgram` (tuition, scholarships, language requirements) from the
universities' own websites. `PLAN.md` is the plan and the business decisions (Mongolian), `BRIEF.md`
is what a research agent follows. Output: `../data/program-research/<slug>.json`; the database is
written only by `pnpm programs:import` (`../import-programs.ts`, `--dry`, `--only`).

## Үргэлжлүүлэх заавар (Монгол)

**Төлөв (2026-10-08):** туршилтын сургууль **Korea University** production дээр орсон (19 танхим,
209 анги). Хуучин бакалавр/магистр/докторын анги, бүх танхим устгагдсан (`../purge-programs.ts`,
нөөц нь `.backups/`-д). **Дахин purge хийх хэрэггүй** — энэ нь нэг удаагийн ажил байсан.
Үлдсэн 134 сургууль `groups.txt`-д байна: GKS-ийн жагсаалтын дарааллаар, 5-аар бүлэглэсэн 27 бүлэг
(P01 эхэнд). Файл нь `../data/program-research/`-д байгаа сургууль судлагдсан гэсэн үг.

**Шинэ chat-д үргэлжлүүлэхдээ** доорх текстийг хуулж өгнө:

> Анги, танхим, төлбөр, тэтгэлгийн судалгааг (1I-10) үргэлжлүүл.
> `apps/api/prisma/program-research-kit/README.md`-г уншаад `groups.txt`-ийн дараагийн бүлгүүдийг
> Sonnet агентуудаар 3-аар нь судлуул. Давалгаа бүрийн дараа файлуудыг хянаж, production дээр
> `--dry` хийгээд импортлоорой.

**Шийдвэрлэгдсэн зүйлс (дахин асуух шаардлагагүй):**
- AI-ийн судалсан анги admin-ий зөвшөөрөлгүйгээр шууд нийтэд гарна (`AI_ASSISTED`, `verifiedAt = null`).
- Оффисын баталгаажуулсан мөр (9 сургуулийн хэлний бэлтгэл) хөндөгдөхгүй, зөрүүг зөвхөн тайлагнана.
- Тэтгэлэг ангийн хоёр талбарт: `scholarshipMaxPercent` = энгийн сайн оюутан авах боломжтой хувь
  (100%-ийн цөөн шилдэг биш), `scholarshipNote` = монгол тайлбар. Тусдаа хүснэгт үүсгэхгүй.
- Зөвхөн 일반대학원. 특수/전문대학원, 계약학과 орохгүй. Өөр кампус нь тусдаа slug.
- Төлбөр = гадаад оюутны төлдөг дүн, улирлаар. Мэдэхгүй бол `null` + `pending`.

**Анхаарах:**
- Kangwon-ийн 3 кампус (`kangwon-national-university-*`) өөр өөр бүлэгт байгаа ч нэг агентад өгнө.
- Том сургууль (200+ анги) нэг агентад ~60 tool call. Жижиг сургууль цөөн.
- Давалгаа бүрийн дараа нийтийн текстийн монгол орчуулгыг (`nameMn`) нүдээр шалгана.

## Running a wave (for the coding agent)

1. Pick the next groups from `groups.txt`; skip slugs that already have a file in
   `../data/program-research/`.
2. Spawn one `general-purpose` agent per group, `model: "sonnet"`, three at a time. Prompt:
   "Read and follow `apps/api/prisma/program-research-kit/BRIEF.md`. Your schools:
   <slug | 한국어 이름 | site> × 5. Use the fetch.sh short-name prefix `pNN-`. Write one JSON per
   school, validate, report under 200 words."
   Large schools (top 10) are better given one or two per agent.
3. Review the files: the `pending` lists, any `tuitionGroup: null`, the Mongolian names. Then from
   the repo root:
   `./deploy/migrate.sh -- pnpm exec tsx prisma/import-programs.ts --dry --only <slugs>` and, if
   clean, the same without `--dry`. One tunnel at a time — `migrate.sh` binds port 55432.
4. After the import: `POST /admin/universities/ranking/recompute` (or wait for the nightly job).
5. Commit the new JSON files with explicit paths — other sessions work in the same tree.

### Searching the research files

`apps/api/prisma/data/.ignore` keeps the research JSON out of ripgrep, so code searches stay
clean. Git and the importers are unaffected. To search the data: `rg --no-ignore <term>
apps/api/prisma/data`. Review a big file with `jq`, not by reading it whole.

### Reader setup

`../intake-research-kit/fetch.sh` reads pages and PDFs; it needs a venv with `pypdf`
(see `../intake-research-kit/README.md`). Chrome is not used: the extension is denied on
university domains, and parallel agents would fight over its tabs.

### Testing the importer locally

The dev Supabase is gone. Use the docker-compose Postgres (`docker compose --profile local-db up -d
postgres`, credentials from the repo-root `.env`'s `POSTGRES_*`), then
`pnpm exec tsx prisma/import-programs.ts --only <slug>`.

### Reading images and cell-losing PDFs

`../intake-research-kit/pdfimg.swift` (PDFKit, macOS) renders PDF pages to PNG so an agent can read a
scanned table, a ○/● matrix or a percent printed inside a picture with the Read tool. `BRIEF.md` tells
agents when to use it. 2026-10-08 it was added after wave 1 left gaps: JBNU grad (석사/박사 columns),
KAU bachelor (fee rows scrambled), CAU bachelor TOPIK 6 scholarship (in an image).
