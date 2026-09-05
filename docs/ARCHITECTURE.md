# ARCHITECTURE.md — GKSedu.mn зуучлалын систем

> Энэ баримт нь `gksedu.md` (бизнесийн тодорхойлолт) дээр суурилсан **техникийн архитектур**.
> Бизнесийн шаардлага зөрчилдвөл `gksedu.md` давуу эрхтэй; энд зөвхөн түүнийг хэрхэн барих
> шийдвэрийг тэмдэглэнэ. Хэрэгжүүлэх дараалал → `ROADMAP.md`, таск бүрийн төлөв → `TASKS.md`.

---

## 0. Хамрах хүрээ

**Хамаарна (Үе шат 1–4):** зуучлалын бүх процесс — сэжим → гэрээ → төлбөр → материал →
мэдүүлэг → урилга → виз → явах бэлтгэл, түүнчлэн нийтийн вэбсайт, сургуулийн сан,
AI чат туслах, дотоод удирдлага, тайлан.

**ХАМААРАХГҮЙ:** Хэл сургалтын төвийн модуль (MIRAE Smart Education — анги, хуваарь, багш,
ирц, сургалтын төлбөрийн мөчлөг). `gksedu.md` §4.4-т тодорхой хойшлуулсан. Түүний техникийн
тодорхойлолт `GKSEDU-ARCHITECTURE.md`-д зөвхөн **ирээдүйн лавлагаа** болгон хадгалагдана.
Энэ системд үлдэх цорын ганц ул мөр нь `Lead.source = "LANGUAGE_CENTER"` гэсэн утга.

---

## 1. Систем түвшний бүтэц

```
                    ┌──────────────────────────────────────────────┐
   Зочин ───────────▶                                              │
   Бүртгэлтэй ──────▶   apps/web  ·  Nuxt 4 (SSR)                  │
   Гэрээтэй ────────▶   ├── (public)  танилцуулга, сургуулийн сан  │
   Ажилтан ─────────▶   ├── (app)     хэрэглэгчийн кабинет         │
   Админ ───────────▶   └── (admin)   CRM, материал, тайлан        │
                    └───────────────────┬──────────────────────────┘
                                        │ REST /api/v1 (JWT)
                    ┌───────────────────▼──────────────────────────┐
                    │  apps/api · NestJS 12 (ESM)                   │
                    │  auth │ leads │ cases │ contracts │ payments  │
                    │  documents │ applications │ visa │ notify     │
                    │  universities │ content │ rag │ reports       │
                    └───┬─────────┬──────────┬──────────┬──────────┘
                        │         │          │          │
                 ┌──────▼──┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────────┐
                 │Postgres │ │ Redis 8 │ │ Object │ │ Гадаад:    │
                 │ 17 +    │ │ cache + │ │ storage│ │ QPay v2    │
                 │ pgvector│ │ BullMQ  │ │(privat)│ │ Email/SMS  │
                 └─────────┘ └─────────┘ └────────┘ │ LLM API    │
                                                    └────────────┘
```

Нэг API, нэг өгөгдлийн сан. Хэрэглэгчийн кабинет ба админ хэсэг **нэг Nuxt апп** дотор
route бүлгээр тусгаарлагдана (тусдаа апп болгох шаардлага одоогоор алга).

---

## 2. Технологийн шийдвэрүүд

| # | Шийдвэр | Шалтгаан |
|---|---|---|
| A1 | Монолит API (NestJS модулиуд), микросервис биш | Багийн хэмжээ, домэйн хоорондын гүйлгээ (гэрээ↔төлбөр↔материал) нэг транзакцид байх шаардлагатай |
| A2 | Postgres нэг сан, `pgvector` мөн адил тэнд | RAG-ийн эх сурвалж нь бизнесийн өгөгдөлтэй ижил эрхийн шүүлтүүр хэрэглэнэ (§12) |
| A3 | Файл — Supabase Storage (S3-нийцтэй), **private bucket** + signed URL | Хувийн бичиг баримт (паспорт, дансны хуулга). DB-д файлын мета, blob биш |
| A4 | BullMQ (Redis) — мэдэгдэл, OCR, PDF үүсгэлт, QPay polling | HTTP хүсэлт дотор гуравдагч талын API-г хүлээхгүй |
| A5 | Төлбөр — QPay v2 (invoice + callback webhook + polling fallback) | `gksedu.md` §5.5. Webhook алдагдвал polling нөхнө |
| A6 | Гэрээ — сервер талд PDF үүсгэж, OTP-баталгаажсан цахим зөвшөөрөл | Дан систем/ЭЦС-ийн интеграц одоогоор тодорхойгүй (§18 асуулт 3) |
| A7 | RBAC + эзэмшлийн шалгалт (ownership guard) | Ажилтан зөвхөн өөрт хуваарилагдсан хэргийг харна (§18.4) |
| A8 | Бүх төлөвийн шилжилт — тусдаа `*_transitions` хүснэгтэд аудит | §17.7 "процессийн явц харагддаггүй" асуудлыг шийдэх үндэс |

---

## 3. Сургуулийн мэдээллийн сан

Эх сурвалж: `/Users/user/korean-universities-data` (135 бичлэг, 108 стандарт лого).
Гараар дахин оруулахгүй — seed скриптээр импортлоно.

```prisma
model University {
  id            String   @id @default(uuid()) @db.Uuid
  slug          String   @unique          // ajou-university
  nameKo        String
  nameEn        String
  nameMn        String
  type          UniversityType            // NATIONAL | PUBLIC | PRIVATE
  foundedYear   Int?
  cityEn        String
  cityMn        String
  regionEn      String
  regionMn      String
  address       String?
  lat           Float?
  lon           Float?
  logoPath      String?
  coverPath     String?
  shortIntroMn  String?
  detailedIntroMn String?
  studentsTotal Int?
  internationalStudents Int?    // датад бөглөгдөөгүй — "мэдээлэл шинэчлэгдэж байна"
  mongolianStudents     Int?
  numCampuses           Int?
  campusInfo            String?
  distanceFromSeoulKm   Float?
  travelTimeFromSeoul   String?
  nearestTransit        String?  // датад бөглөгдөөгүй
  advantages    String[]                  // 3–6 монгол өгүүлбэр
  livingCost    Json?                     // tier, min/max, задаргаа, isEstimate
  dormitory     Json?                     // ихэвчлэн null — "мэдээлэл шинэчлэгдэж байна"
  links         Json                      // officialWebsite, wikipedia, wikidata
  quality       Json                      // талбар бүрийн эх сурвалж
  // --- зуучлалд шаардлагатай, дата сангаас ИРЭХГҮЙ, гараар бөглөнө ---
  acceptsLanguagePrep   Boolean @default(false)   // §4.1 бүх сургууль МУ-аас авдаггүй
  acceptsFromMongolia   Boolean @default(true)
  isGksEligible         Boolean @default(false)   // §4.3
  agentContractStatus   AgentContractStatus @default(NONE)
  commissionNote        String?                   // дотоод, §15.5
  internalNote          String?                   // дотоод
  isPublished           Boolean @default(false)
  // --- Эрэмбэ (§3.1) ---
  theKoreaRank  Int?                      // THE-ийн Солонгосын эрэмбэ; null = рэйтингд ороогүй
  theWorldRank  String?                   // "=58", "251–300", "1501+" — интервал тул текст
  theRankYear   Int?                      // 2026
  gksScore      Float?                    // манай 0–100 оноо; зөвхөн систем бичнэ
  gksRank       Int?                      // gksScore-оор гаргасан эрэмбэ, 1 = эхэнд
  gksRankBoost  Float @default(0)         // ажилтны гар засвар, -25…+25 оноо
  gksScoreParts Json?                     // задаргаа: base/partnership/fit/demand/practical
  gksScoredAt   DateTime?
  programs      UniversityProgram[]
  intakes       IntakeTerm[]
}
```

- `UniversityProgram` — түвшин (`LANGUAGE_PREP|BACHELOR|MASTER|PHD`), мэргэжил, хэлний
  шаардлага (TOPIK/IELTS), сургалтын төлбөр, элсэлтийн шаардлага.
- `IntakeTerm` — жил, сар (3/6/9/12), мэдүүлгийн эцсийн хугацаа, төлөв.
  Хэлний бэлтгэл жилд 4 удаа, үндсэн анги 2 удаа (§4.1, §4.2).
  Ерөнхий төлөвлөгчид хэлний бэлтгэлийн 3/6/9/12 сарын элсэлтийн бүртгэлийг тус бүр
  1/4/7/10 сарын сүүлээр, үндсэн ангийн бүртгэлийг хичээл эхлэхээс 2 сарын өмнө
  хаагдахаар тооцно. Сургууль бүрийн бодит хугацааг `IntakeTerm`-ийн утга орлоно.

**Хэрэгжилт:** `apps/api/prisma/import-universities.ts` (`pnpm universities:import`,
`--publish` тугтай бол нийтэлнэ, `--no-assets` бол зөвхөн DB). Лого нь `0-08` (storage
adapter) бэлэн болтол `apps/web/public/universities/logos`-оос үйлчилнэ.

**Импортын дүрэм:** JSON-оос ирсэн талбарууд `quality`-тэй хамт хадгалагдана; `null` утгыг
frontend дээр "мэдээлэл шинэчлэгдэж байна" гэж үзүүлнэ, 0 гэж биш. `advantages`, `nameMn` нь
редакцийн текст — нээлтээс өмнө хүн шалгана. Дахин импорт нь `slug`-аар `upsert` хийж,
гараар бөглөсөн талбаруудыг (`acceptsLanguagePrep` … `internalNote`) **дарж бичихгүй**.

### 3.1. Хоёр эрэмбэ — үндсэн rank ба GKS rank (1A-28 … 1A-31)

Сургууль бүр **хоёр** эрэмбэ авна. Эхнийх нь гаднаас ирдэг, хоёр дахь нь манайх.

| | Үндсэн rank | GKS rank |
|---|---|---|
| Талбар | `theKoreaRank`, `theWorldRank`, `theRankYear` | `gksScore`, `gksRank`, `gksScoreParts` |
| Эх сурвалж | Times Higher Education — *Best universities in South Korea* (2026 хувилбар) | Манай томьёо |
| Хамрах хүрээ | Солонгосын **41** сургууль (манай каталогийн 40 нь таарна; DGIST бидэнд алга) | 135/135 |
| Хэн бичдэг | `pnpm ranking:import` (`the-korea-ranking.ts` дэх хүснэгт) | `GksRankingService.recompute()` |
| Нийтэд харагдах уу | **Тийм** — картан дээр «Солонгост #5», дэлгэрэнгүйд дэлхийн эрэмбэ хамт | **Үгүй** — зөвхөн эрэмбэлэлтэд ажиллана, тоо нь админд л харагдана |

**GKS rank нь каталог болон хайлтын үндсэн эрэмбэ.** `GET /universities`-ийн `sort`-ийн
анхдагч утга `gks`; хэрэглэгч хүсвэл `rank` (THE), `name`, `students`, `founded`, `city`
руу шилжинэ. Нүүр хуудасны «онцлох» болон логоны хэсэг ч мөн адил `gks`-ээр эрэмбэлэгдэнэ.

**Оноо (`apps/api/src/modules/universities/ranking/gks-ranking.math.ts`).** Тав бүрэлдэхүүн,
тус бүр 0–100, дараа нь жингээр холилдоно. Жин нь **харьцангуй** — нийлбэрээр нь
нормчилдог тул 100 болох албагүй.

| Бүрэлдэхүүн | Анхдагч жин | Юу хэмждэг |
|---|---|---|
| `base` | 40 | THE-ийн Солонгосын эрэмбэ. #1 → 100, #40 → 45 |
| `partnership` | 20 | `agentContractStatus`: SIGNED 100 / IN_TALKS 60 / EXPIRED 25 / NONE 10 |
| `fit` | 15 | `isGksEligible` 35 + `acceptsLanguagePrep` 30 + `acceptsFromMongolia` 20 + монгол оюутны тоо 15 |
| `demand` | 15 | хадгалсан тоо 40 + `Case` тоо 35 + мэдүүлгийн зөвшөөрөгдөх хувь 25 |
| `practical` | 10 | төлбөр 30 + амьжиргаа 25 + Сөүлээс алслалт 20 + мэдээллийн бүрэн байдал 25 |

Дараа нь `gksRankBoost` (ажилтны гар засвар, ±25 оноо) нэмэгдэж, 0–100 хооронд хязгаарлагдаж,
`gksRank` нь буурах онооны **dense** эрэмбэ болно (тэнцвэл ижил дугаар авна).

Хоёр зарчим кодод бичигдсэн:

1. **Мэдэгдэхгүй нь хамгийн муу биш.** Дутуу тоо бүрэлдэхүүнийхээ саармаг дунджийг авна,
   тэг биш. THE-д ороогүй 94 сургууль `unrankedBaseScore` (анхдагчаар 45 — яг 40-р
   сургуулийн оноо) авдаг нь үүний хамгийн том тохиолдол. Мэдүүлгийн түүхгүй сургууль
   Лапласын урьдчилсан магадлалаар 0.5 авна — шинэ байсандаа сүүлд орохгүй.
2. **Тоонууд харьцангуй.** «Хамгийн их хадгалагдсан» гэдэг нь тухайн өдрийн хамгийн
   ачаалалтай сургуультай харьцуулсан утга, тул нэг сургуулийг дангаар нь дахин онооход
   утгагүй — 135 мөрийг үргэлж хамт тооцоолно.

**Хэзээ дахин тооцоолох вэ.** BullMQ дээр өдөрт нэг удаа (`gks-ranking` дараалал,
`immediately: true` тул шинэ deploy шууд эрэмбэлнэ), мөн каталогийн засвар бүрийн дараа
дараалалд ордог (`AdminUniversitiesService.invalidate` → `scheduleRecompute`, 5 секундын
саатал нь олон засварыг нэг ажил болгож нэгтгэнэ). Админ `POST
/admin/universities/ranking/recompute`-оор яг одоо ажиллуулж болно. Бичилт нь 135 тусдаа
`update` биш, ганц `UPDATE … FROM (VALUES …)` — Supabase pooler 115 мс зайтай тул (CLAUDE.md,
хатуу дүрэм 8).

**Жин тохируулах.** `GksRankingConfig` — ганц мөр (`id = "default"`), `ServicePricing`-тэй
адил бизнесийн тохиргоо, тогтмол биш. Дэлгэц: `/admin/universities/ranking` — жин засах,
хадгалахаас өмнө `GET …/ranking/preview`-ээр урьдчилан харах, задаргааг мөр бүрээр нээх.

---

## 4. CRM — боломжит харилцагч (Lead)

```prisma
model Lead {
  id              String     @id @default(uuid()) @db.Uuid
  userId          String?    @db.Uuid        // бүртгүүлсэн бол холбогдоно
  firstName String;  lastName String
  phone     String;  email String?
  age Int?;  educationLevel EducationLevel?
  gpa Float?;  gpaScale String?              // §24 асуулт 1 — шаталбар тодорхойгүй
  koreanLevel String?;  englishLevel String?
  interestedServices  ServiceType[]
  interestedUniversityIds String[] @db.Uuid
  interestedMajor String?
  plannedIntakeId String?  @db.Uuid
  source          LeadSource                 // WEBSITE|AI_CHAT|PHONE|SOCIAL|OFFICE|LANGUAGE_CENTER|REFERRAL
  stage           LeadStage  @default(NEW)
  assignedToId    String?    @db.Uuid
  nextContactAt   DateTime?
  winProbability  Int?                       // §15.1 "гэрээ болох магадлал", 0–100
  lostReason      String?
  activities      LeadActivity[]
}
```

**Борлуулалтын үе шат (`LeadStage`):**

```
NEW → CONTACTED → CONSULTED → PROPOSAL_SENT → CONTRACT_PENDING → WON
                                    └──────────────────────────→ LOST
```

`WON` болох нь `Client` үүсгэх үйлдлээр хийгддэг (§4a, 1B-10): ажилтан сэжмийг
хэрэглэгч болгон бүртгэхэд `Client` + `Case` үүсч, сэжим `WON` болж, тэр шилжилт
`LeadActivity`-д бичигдэнэ. `LeadActivity` нь дуудлага, уулзалт, чат, тэмдэглэл,
даалгаврыг нэг цаг хугацааны хэлхээнд хадгална (§15.1).

---

## 4a. `Client` — гэрээт харилцагч (1B-14)

`Lead` бол **гэрээний өмнөх сонирхогч**, `Client` бол **оффис хүлээж авсан хүн**. Энэ хоёр нь
зориудаар **тусдаа хүснэгт** бөгөөд админ талд ч тусдаа хуудастай (`/admin/leads`,
`/admin/clients`). Сэжмээс хэрэглэгч үүсгэхэд өгөгдөл **хуулагдана**, сэжим өөрөө
борлуулалтын түүх болж үлдэнэ (`Lead.client` холбоос).

**Хэрэглэгчийг сэжимгүйгээр шууд үүсгэж болно** — оффисоор ирсэн хүнийг эхлээд сэжим
болгож бүртгэх шаардлагагүй (`POST /clients`).

```prisma
model Client {
  id     String  @id @default(uuid()) @db.Uuid
  code   String  @unique                       // KH-2026-0042
  userId String  @unique @db.Uuid              // Case/Contract/Payment-ийн заадаг account
  leadId String? @unique @db.Uuid              // хөрвүүлсэн сэжим (1B-10)

  lastName String;  firstName String
  birthDate DateTime @db.Date
  registerNumber String @unique                // регистрийн дугаар — гэрээнд бичигдэнэ
  gender Gender?;  phone String;  phoneAlt String?
  email String?;   address String?

  // Төлөөлөн гэрээ байгуулагч — 18 нас хүрээгүй үед заавал (§6.2)
  guardianLastName String?;  guardianFirstName String?
  guardianRegisterNumber String?;  guardianPhone String?;  guardianRelation String?

  educationLevel EducationLevel?;  schoolName String?
  gpa Float?;  gpaScale String?;  koreanLevel String?;  englishLevel String?
  passportNumber String?;  passportExpiry DateTime?

  primaryServiceType ServiceType                // бүртгэх үед сонгосон үйлчилгээ
  targetUniversityId String? @db.Uuid
  targetMajor String?;  plannedIntakeId String? @db.Uuid

  source LeadSource;  status ClientStatus @default(ACTIVE);  note String?
  assignedConsultantId String? @db.Uuid
  createdById String? @db.Uuid
}
```

**Яагаад `User` мөр заавал үүсдэг вэ.** `Case`, `Contract`, `Payment` гурав нь `userId`
дээр тогтдог тул хэрэглэгч бүр `User` мөртэй. Ажилтны бүртгэсэн хүний тэр мөрөнд **нууц
үг байхгүй** (`User.password` nullable) тул нэвтрэх боломжгүй — хожим өөрөө бүртгэлээ
эзэмших үед л нууц үг тавигдана. Имэйлгүй хүн бас байж болно (`User.email` nullable),
хуурамч имэйл огт үүсгэхгүй.

**Нас ба төлөөлөгч.** 18 нас хүрээгүй бол гэрээг асран хамгаалагч байгуулна. Насыг
клиентээс ирсэн туг биш, `birthDate`-аас сервер тал тооцож шалгана
(`ClientsService.assertGuardianPresent`).

**Жагсаалтын харагдац.** `/admin/clients` мөр бүр дээр овог нэр, утас, үйлчилгээ,
сургууль, **зуучлалын үе шат** (идэвхтэй `Case`-ийн `stage`), гэрээний төлөв ба огноо
харагдана; нэр/утас/регистр/код/имэйлээр хайж, үйлчилгээ, үе шат, төлөв, суваг,
гэрээтэй эсэх, хариуцагчаар шүүнэ.

---

## 5. `Case` — гол агрегат

Нэг `Case` = нэг хэрэглэгч × нэг үйлчилгээ × нэг зорилтот сургууль × нэг элсэлтийн улирал.
Хэрэглэгч дараа нь бакалаврт дахин зуучлуулбал шинэ `Case` үүснэ (§20).

```prisma
model Case {
  id            String @id @default(uuid()) @db.Uuid
  code          String @unique                 // GKS-2026-0417 — хүн уншихад
  userId        String @db.Uuid
  serviceType   ServiceType                    // LANGUAGE_PREP|BACHELOR|MASTER|PHD|GKS_SCHOLARSHIP
  universityId  String? @db.Uuid
  programId     String? @db.Uuid
  intakeId      String? @db.Uuid
  stage         CaseStage @default(CONTRACT_DRAFT)
  assignedConsultantId String? @db.Uuid
  assignedDocOfficerId String? @db.Uuid
  contract      Contract?
  documents     CaseDocument[]
  application   Application?
  visaCase      VisaCase?
  payments      Payment[]
  transitions   CaseTransition[]
}
```

**Үе шатны урсгал** (`CaseStage`) — үйлчилгээний төрлөөс хамааран **төлбөрийн байрлал ялгаатай**:

```
Энгийн зуучлал (хэлний бэлтгэл / BA / MA / PhD):
CONTRACT_DRAFT → CONTRACT_SIGNED → PREPAYMENT_PAID → DOCUMENTS → APPLICATION_SUBMITTED
  → ADMITTED → TUITION_INVOICED → INVITATION_RECEIVED → VISA → VISA_APPROVED
  → BALANCE_PAID → COLLATERAL_CONTRACT* → PRE_DEPARTURE → DEPARTED → COMPLETED

GKS тэтгэлэг:
CONTRACT_DRAFT → CONTRACT_SIGNED → PREPAYMENT_PAID → DOCUMENTS → APPLICATION_SUBMITTED
  → GKS_ROUND1_PASSED → GKS_ROUND2_PASSED → BALANCE_PAID → VISA → VISA_APPROVED
  → PRE_DEPARTURE → DEPARTED → COMPLETED

Хаана ч болж болох: ON_HOLD, CANCELLED, REJECTED
```

`*` `COLLATERAL_CONTRACT` — зөвхөн **энгийн зуучлалын хэлний бэлтгэл**-д (§5.4).

Үе шатны дараалал кодод хатуу биш, `CaseFlowDefinition` (үйлчилгээ тус бүрийн шатны
жагсаалт + шилжилтийн нөхцөл) байдлаар өгөгдөл болж хадгалагдана. Шилжилт бүр
`CaseTransition`-д (хэн, хэзээ, ямар шалтгаанаар) бичигдэнэ.

---

## 6. Гэрээ ба төлбөр

### 6.1. Үйлчилгээний үнэ

```prisma
model ServicePricing {
  serviceType     ServiceType
  totalAmount     Decimal        // 1,200,000₮ / 5,000,000₮ — ОДООГИЙН утга
  prepaymentMode  PrepaymentMode // PERCENT | FIXED   (§5.4)
  prepaymentValue Decimal
  balanceTrigger  BalanceTrigger // AFTER_VISA_APPROVED | AFTER_SCHOLARSHIP_RESULT  (§9)
  effectiveFrom   DateTime
  effectiveTo     DateTime?
}
```

Үнэ **хувилбартай** (`effectiveFrom/To`). Гэрээ үүсэхдээ тухайн үеийн pricing-ийн snapshot-ыг
`Contract` дээр хуулж авна — дараа үнэ өөрчлөгдөхөд хуучин гэрээ өөрчлөгдөхгүй
(§24 асуулт 4-ийн хариу нь энэ загвараар "зөвхөн шинэ гэрээнд").

### 6.2. Гэрээ

`Contract`: төрөл (`ELECTRONIC|PHYSICAL`), төлөв
(`DRAFT → SENT → SIGNED → ACTIVE → COMPLETED | TERMINATED`), үнийн snapshot, төлбөрийн
хуваарь, буцаалтын нөхцөл (`refundPolicy Json`), PDF файл, гарын үсгийн бүртгэл
(`signedAt`, `signedIp`, `otpVerifiedAt`), биет гэрээний скан.

`CollateralContract` (барьцааны гэрээ, §5.4) — зөвхөн **3 талбар**: байгуулагдсан эсэх,
хугацаа (эхлэх/дуусах), биет файл. Хөрөнгийн үнэлгээ, дүн систем тооцохгүй, төлбөрийн
модультай холбогдохгүй.

### 6.3. Төлбөр

```prisma
model Payment {
  caseId      String @db.Uuid
  kind        PaymentKind    // PREPAYMENT | BALANCE | SCHOOL_TUITION | TRANSFER_FEE | EXTRA_SERVICE | REFUND
  amountMnt   Decimal
  amountKrw   Decimal?       // сургуулийн төлбөрт (§8)
  fxRate      Decimal?
  status      PaymentStatus  // PENDING | PAID | FAILED | EXPIRED | REFUNDED
  qpayInvoiceId String?
  qpayPaymentId String?
  paidAt      DateTime?
  receiptPath String?
  dueAt       DateTime?
}
```

**QPay урсгал:** нэхэмжлэл үүсгэх → QR/deeplink буцаах → (a) webhook callback, (b) 10 сек
тутам 15 минутын турш polling (BullMQ давтагдах ажил). Хоёулаа **идемпотент** —
`qpayInvoiceId` дээр unique. Төлбөр `PAID` болмогц `Case` үе шат урагшилж, мэдэгдэл явна.

> **Тодруулга шаардлагатай:** §9-д "үлдэгдэл төлөгдсөний дараа визний хэсэг нээгдэнэ" гэсэн
> нь энгийн зуучлалын "виз гарсны дараа үлдэгдэл" дүрэмтэй зөрчилдөж байна. Одоогийн загвар
> `BalanceTrigger`-ийг тохиргоо болгосон тул хоёуланг нь дэмжинэ — гэхдээ бизнесийн талаас
> эцсийн дараалал батлагдах шаардлагатай (§18, асуулт 6).

---

## 7. Материалын шаардлагын хөдөлгүүр (хамгийн чухал модуль)

Одоо ажилтан жагсаалтыг гараар гаргадаг (§17.4). Систем үүнийг **дүрмээр** үүсгэнэ.

### 7.1. Загвар ба дүрэм

```prisma
model DocumentTemplate {
  code            String @unique       // PASSPORT, ID_REF_EN, HS_TRANSCRIPT …
  nameMn          String
  descriptionMn   String?
  sourceHint      String?              // "E-Mongolia-аас"
  issuerHint      String?              // ямар байгууллагаар баталгаажуулах
  validityDays    Int?                 // хүчинтэй хугацаа
  needsTranslation Boolean @default(false)
  needsNotary      Boolean @default(false)
  needsApostille   Boolean @default(false)
  needsPhysicalOriginal Boolean @default(false)   // "эх хувиар авчрах"
  acceptedFileTypes String[]           // pdf, docx, jpg
  sampleFilePath  String?
  tipsMn          String?
}

model RequirementRule {
  templateId     String @db.Uuid
  stage          DocStage        // ADMISSION | VISA          (§6, §10)
  serviceTypes   ServiceType[]   @default([])   // хоосон = бүгд
  educationLevels EducationLevel[] @default([])
  universityId   String? @db.Uuid // null = бүх сургууль
  guarantorTypes GuarantorType[] @default([])  // EMPLOYEE | COMPANY_DIRECTOR | SELF_EMPLOYED | NONE
  // Батлан даагч эцэг эх биш үед төрөл садангийн лавлагаа нэмэгддэг (§6.1 III).
  guarantorRelations GuarantorRelation[] @default([]) // PARENT | SIBLING | UNCLE_AUNT | OTHER
  necessity      Necessity       // REQUIRED | CONDITIONAL | OPTIONAL
  conditionNote  String?         // "байгаа тохиолдолд", "манай байгууллагаас шаардсан үед"
  sortOrder      Int
}
```

> **`@default([])` нь заавал.** Массив баганыг орхивол Postgres-д `NULL` бичигдэж,
> Prisma-гийн `isEmpty` шүүлтүүрт таарахаа болино — "хоосон = бүгдэд хамаарна" гэсэн
> дүрмийн бүхий л суурь ажиллахгүй болно (migration `20260904220000`).

`Burduuleh_materialiin_jagsaalt_negdsen.docx`-д байгаа бодит дүрмүүд яг энэ загварт буудаг:

| Нөхцөл | Үр дүн |
|---|---|
| `educationLevel = HIGH_SCHOOL_GRAD` | 9 үндсэн материал (аттестат, 10–12-р ангийн дүн …) |
| `educationLevel = UNIVERSITY_GRAD` | 10 үндсэн материал (диплом, 1–4 курсын дүн …) |
| `guarantorType = EMPLOYEE` | НД-ын лавлагаа + ажлын газрын тодорхойлолт |
| `guarantorType = COMPANY_DIRECTOR` | ХЭ-ийн лавлагаа + татварын тодорхойлолт + дансны хуулга |
| `guarantorType = SELF_EMPLOYED` | түрээсийн гэрээ + тодорхойлолт + дансны хуулга |
| батлан даагч нь ах/эгч/авга/нагац | + төрөл садангийн лавлагаа |

**Хэрэглэгчийн нөхцөл (`CaseConditions`)** — боловсролын түвшин, батлан даагчийн ажил
эрхлэлт, батлан даагчийн хамаарал. `Client`-ээс тусдаа: нэг хүн өөр өөр батлан даагчтай
хоёр хэрэг явуулж болно. Анкет бөглөөгүй бол хөдөлгүүр `Client.educationLevel`-ийг
нөөцөөр авна.

**Шийдэлт (resolution):** `Case` нь `DOCUMENTS` шатанд орох үед хөдөлгүүр
`(stage, serviceType, educationLevel, universityId, guarantorType, guarantorRelation)`-аар
дүрмүүдийг шүүж `CaseDocument` мөрүүдийг үүсгэнэ. Хэрэглэгчийн нөхцөл өөрчлөгдвөл (жишээ
нь батлан даагчаа солих) жагсаалт **дахин тооцоологдоно** — аль хэдийн илгээгдсэн
материалыг устгахгүй, гар хүрээгүй (`NOT_STARTED`) мөрийг л soft-delete хийнэ. Нэг загварыг
хоёр дүрэм нэрлэвэл эрэмбээр эхнийх нь ялна, тул сургуулийн тусгай дүрэм (1D-18)
ерөнхий дүрмийг дардаг.

### 7.2. Материалын төлөв (§6.2 — 12 төлөв)

```
NOT_STARTED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW ─┬→ NEEDS_FIX → RESUBMIT_REQUIRED ──┐
                                                      │                                   │
                                                      └→ ACCEPTED → IN_TRANSLATION →      │
                                                         TRANSLATED → CERTIFIED → READY   │
                                                         → SENT_TO_UNIVERSITY             │
                                             ◀────────────────────────────────────────────┘
```

`CaseDocument` нь олон `DocumentFile` хувилбартай (засварын түүх хадгалагдана, §15.4).
Ажилтны тайлбар бүр `DocumentReviewNote` — хэрэглэгч юуг яагаад засахыг харна (§6.3).

### 7.3. Ажлын хуваарилалт

Орчуулга, анкет бөглөх, эсээ боловсруулах зэрэг нь `WorkTask` (§6.4) — гүйцэтгэгч,
эцсийн хугацаа, төлөвтэй. Ажилтны ачааллын тайлан эндээс гарна (§15.6).

### 7.4. Оффист ирэх ба эцсийн хугацаа

- **`OfficeAppointment`** (1D-11) — `needsPhysicalOriginal` тэмдэгтэй бүх материалыг нэг
  удаа авчирна. Хэрэг дээр нэг л `SCHEDULED` товлолт зэрэг байж болно (§17.5).
- **`DocumentReminder`** (1D-12) — өдөр тутмын BullMQ ажил `dueAt`-аас D-7/D-3/D-1-д
  сануулга үүсгэнэ. `@@unique([caseDocumentId, offsetDays])` нь идемпотентын түлхүүр:
  ажил өдөрт хэдэн ч удаа ажиллахад D-7 нэг л удаа гарна. Имэйл/SMS хүргэлт нь §10-ийн
  dispatcher (1G-02) дээр залгагдана.

---

## 8. Мэдүүлэг → урилга → виз

**`Application`** (§7) — төлөв:
`PREPARING → READY → SUBMITTED → UNDER_REVIEW → ADDITIONAL_DOCS_REQUESTED → INTERVIEW_SCHEDULED → ACCEPTED | REJECTED | DEFERRED`

GKS-ийн хувьд шийдвэр **хоёр шаттай** — `ApplicationResult` мөрүүд `round` талбартай
(1, 2); энгийн зуучлалд ганц мөр (`round = 1`).

**`SchoolInvoice` + `Invitation`** (§8) — воны дүн, ханш, шимтгэл, эцсийн хугацаа, төлсөн
баримт, сургууль хүлээн авсан эсэх. Төгрөгийн дүн нэхэмжлэх үүсэх мөчид тухайн өдрийн
ханшаар **тогтоогдож хадгалагдана** (`FxRate` хүснэгттэй join хийхгүй): маргааш ханш
хөдөлсөнөөс хэрэглэгчид хэлсэн дүн өөрчлөгдөж болохгүй. Урилга бүртгэгдснээр `Case` нь
`INVITATION_RECEIVED` болж, `VisaCase` үүсэн визний материалын жагсаалт §7-гийн хөдөлгүүрээр
шийдэгдэнэ.

**`VisaCase`** (§10) — төлөв:
`COLLECTING → REVIEWING → READY → SUBMITTED → ADDITIONAL_DOCS_REQUESTED → APPROVED | REJECTED | REAPPLY`
Визний материалын жагсаалт нь §7-гийн ижил хөдөлгүүрээр, `stage = VISA` дүрмүүдээр үүснэ.

**`DeparturePlan`** (§11) — чеклист (билет, даатгал, тосох, байр, SIM, банк …), гарын авлага,
видео заавар, санамжийн огноо.

---

## 9. Файл хадгалалт

- Private bucket, зам: `cases/{caseId}/{docCode}/{version}-{uuid}.{ext}`
- Хандалт зөвхөн богино хугацааны signed URL-аар (5 мин), API нь эрх шалгасны дараа гаргана
- Байршуулах өмнө: MIME sniff, хэмжээний хязгаар (20MB), вирус скан (дараагийн үе шат)
- Устгал — logical (`deletedAt`), гэрээний хугацаанд бодит устгал хийхгүй

---

## 10. Мэдэгдэл ба автоматжуулалт (§16) — **хийгдсэн (1G-01…1G-07)**

`NotificationTemplate` (`event × channel` unique, монгол текст, `{{placeholder}}`) +
`Notification` (хүлээн авагч, рендерлэгдсэн текст, төлөв, илгээсэн огноо) +
`NotificationPreference` (хэрэглэгч × суваг).

Сувгууд: **in-app** (үргэлж, унтраах боломжгүй), **email** (Resend), **SMS**,
`PUSH` нь enum-д байгаа ч provider холбогдоогүй.

Триггер хоёр эх үүсвэртэй:
1. **Үйл явдал** — домэйн сервисүүд `NotificationsService.dispatch()`-ийг гүйлгээний
   **гадна** дуудна: дараалал унасан ч гарын үсэг зурагдсан гэрээ буцахгүй.
2. **Хуваарь** — `ReminderSweepsService` өдөрт нэг удаа: материалын хугацаа (D-7/D-3/D-1),
   төлбөр (D-3/D-0), виз мэдүүлэх өдөр (D-3/D-1), виз сунгалт (D-30/D-14),
   явах өдөр (D-14/D-7/D-1), сэжимтэй холбогдох өдөр.

**Давхардлаас хамгаалалт.** Хуваарьт мэдэгдэл бүр `dedupeKey`-тэй
(`event:channel:userId:subject`, unique индекс). Ажил өдөрт хэдэн ч удаа ажиллаж болох ба
нэг сануулга нэг л удаа очно — `sweepAll()` бодитоор үүссэн мөрийн тоог буцаана.

**Илгээлт.** In-app мэдэгдэл нь мөр бичигдсэнээрээ хүрсэнд тооцогдоно; email/SMS BullMQ-ээр
явж, 3 удаа дахин оролдоно. `Notification` мөр өөрөө бүртгэл — сүүлчийн алдаа тэнд хадгалагдана.

**SMS өртгийн хяналт (1G-04).** Цорын ганц төлбөртэй суваг тул хоёр таазтай:
хэрэглэгч тутам өдөрт (`SMS_DAILY_LIMIT_PER_USER`, анхдагч 3) ба платформ даяар өдөрт
(`SMS_DAILY_LIMIT_GLOBAL`, анхдагч 500). Тоолол `notifications` хүснэгтээс уншигдана —
Redis цэвэрлэгдэхэд төсөв дахин нээгдэх ёсгүй.

---

## 11. Эрхийн загвар

| Роль | Хамрах хүрээ |
|---|---|
| `GUEST` (нэвтрээгүй) | нийтийн контент, сургуулийн сан, зөвлөгөөний хүсэлт |
| `USER` | өөрийн профайл, хадгалсан сургууль, өөрийн `Case`-үүд |
| `CONSULTANT` | өөрт хуваарилагдсан `Lead`/`Case`, гэрээ үүсгэх, төлбөр харах |
| `DOC_OFFICER` | өөрт хуваарилагдсан `Case`-ийн материал, орчуулга, мэдүүлэг |
| `ADMIN` | бүгд + тохиргоо, үнэ, загвар, ажилтны эрх, AI мэдлэгийн сан |

"Гэрээтэй хэрэглэгч" (§18.3) нь **роль биш** — идэвхтэй `Contract`-тай `USER`.

`CaseAccessGuard` (0-13) роль + эзэмшлийг хоёуланг нь шалгана. `CONSULTANT`/`DOC_OFFICER`
нь өөрт оноогдсон, эсвэл **хараахан хэн ч оноогдоогүй** хэрэгт хандана: хариуцагчгүй хэрэг
хэнд ч харагдахгүй бол шинэ ажил үл үзэгдэх болно.

`AuditLog` (0-11) — `@Audit({ action, entity })` тэмдэглэгээтэй route бүр амжилттай
дуусахад нэг мөр бичнэ (хэн, юуг, хэзээ, ямар payload-оор, `requestId`). Нууц үг, токен,
OTP зэрэг талбарууд `[redacted]` болж хадгалагдана. Уншилтын route бүрийг бүртгэхгүй —
route өөрөө сонгож оролцоно.

---

## 12. AI чат туслах ба мэдээллийн эрхийн түвшин (§13)

RAG нь одоо байгаа `Document` / `DocumentChunk` (pgvector, HNSW cosine) дээр суурилна,
дараах нэмэлттэй:

```prisma
model Document {
  accessLevel  AccessLevel   // PUBLIC | REGISTERED | CONTRACTED | INTERNAL   (§13.3)
  category     String?       // school | service | pricing | scholarship | faq | policy
  universityId String? @db.Uuid
  sourceFile   String?       // эх Word/PDF
}
```

Хайлтын үед хэрэглэгчийн түвшнээс **дээш** эрхийн бичиг баримт огт буцаахгүй — шүүлтүүр нь
SQL `WHERE` дотор, LLM-ийн prompt дотор биш. Хариулт бүр эх сурвалжийн ишлэлтэй.
Мэдэхгүй зүйлээ зохиохгүй (заавал "ажилтантай холбогдох" fallback).

> ⚠️ Одоогийн `EmbeddingService` бол SHA-256 суурьтай **stub** — утга агуулгагүй. Жинхэнэ
> embedding загвар (жишээ нь `text-embedding-3-small`, 1536 хэмжээст) солигдох хүртэл RAG
> таск "дууссан" гэж тооцогдохгүй.

Чат бүр `ChatSession`/`ChatMessage`-д хадгалагдаж, зочин хэрэглэгчийн мэдээлэл цуглуулсан
тохиолдолд `Lead` үүсгэнэ (§13.1). Хариултын чанарын үнэлгээ (👍/👎) тайланд орно.

---

## 13. Тайлан (§19) — **хийгдсэн (1G-08…1G-11)**

Материалжуулсан харагдац 4:

| Харагдац | Нэг мөр = | Хэрэглээ |
|---|---|---|
| `mv_sales_funnel` | сар × суваг × үе шат | 1B-11 юүлүүр, хөрвөлт |
| `mv_finance` | сар × үйлчилгээ × төрөл × төлөв | 1G-10 орлого, авлага, буцаалт |
| `mv_document_progress` | хэрэг | материалын явц, хугацаа хэтрэлт |
| `mv_staff_performance` | ажилтан | 1G-11 гүйцэтгэл |

Тус бүр unique индекстэй тул шөнийн ажил `REFRESH MATERIALIZED VIEW CONCURRENTLY`-ээр
уншигчийг блоклохгүй шинэчилнэ (анх удаа дүүргэхэд блоклох хэлбэрт шилжинэ).

Prisma харагдацыг загварчилдаггүй тул `reports.service.ts` `$queryRaw`-аар уншиж, мөрийн
төрлийг гараар зарлана. Хяналтын самбарын **төлөв тоолох** үзүүлэлтүүд (хэрэг ямар үе шатанд
байгаа, энэ сарын шинэ сэжим) нь шууд хүснэгтээс уншигдана — удирдлагын дэлгэц дээр шөнийн
өмнөх тоо харуулах нь буруу.

---

## 14. API конвенц

- Бааз зам `/api/v1`, `AllExceptionsFilter`-ийн нэг алдааны бүтэц + `requestId`
- Жагсаалт бүр `?page&limit&sort&q` — `PaginationDto`
- Төлөв өөрчлөх нь тусдаа үйлдлийн endpoint: `POST /cases/:id/transitions`, ерөнхий
  `PATCH` биш — ингэснээр зөвшөөрөгдсөн шилжилтийг сервер шалгана
- Бүх бичих үйлдэл zod/`class-validator`-аар шалгагдана; хуваалцсан схем `packages/shared`
- Swagger `/api/docs` — бүх endpoint тайлбартай

---

## 15. Frontend бүтэц

```
apps/web/app/pages/
├── index.vue, universities/, blog/, faq/, consultation.vue   ← нийтийн (SSR, SEO)
├── login.vue, register.vue                                   ← нэвтрэх, бүртгүүлэх
├── app/                              ← хэрэглэгчийн кабинет (layout: portal)
│   ├── index.vue     (хяналтын самбар — дараагийн алхам, явцын зураглал)
│   ├── profile.vue   (өөрийн мэдээлэл — гэрээний эх сурвалж)
│   ├── start.vue     (үйлчилгээ сонгож, гэрээгээ өөрөө үүсгэх)
│   └── cases/[id]/   (явц, гэрээ, төлбөр, материал, мэдүүлэг, виз, бэлтгэл)
└── admin/                            ← ажилтан/админ (layout: admin)
    ├── leads/, clients/, cases/, documents/, work-tasks/,
    ├── contracts/, payments/, applications/, visa/, settings/
```

Гурван бүрхүүл: `default` (нийтийн вэбсайт), `portal` (хэрэглэгчийн кабинет),
`admin` (CRM). Кабинетын бүх дэлгэц `/me/*` API-аар ажиллана — хүсэлт бүр дуудагч
дээрээ л үйлчилдэг тул нэг хэрэглэгч нөгөөгийнхөө хэргийг хэзээ ч уншиж чадахгүй.

**Дараагийн алхам нэг эх сурвалжтай.** "Юу хийх ёстой вэ?" гэсэн хариулт сервер дээр
(`me/next-action.ts`) тооцоологдож, хяналтын самбар, хэргийн толгой, ирээдүйд мэдэгдлийн
загвар гурав нэг ижил өгүүлбэр харуулна. Клиент тал үүнийг давхардуулж тооцохгүй.

`components/ds/*` бол одоо байгаа дизайн системийн үндэс (`tokens.css` — GKS EDU GROUP-ийн
өнгө, төлөвийн 5 шатны токен аль хэдийн тодорхойлогдсон). Шинэ UI зөвхөн эдгээр токеноор.

---

## 16. Аюулгүй байдал

- Хувийн мэдээлэл (паспорт, регистр, дансны хуулга) — хандалт бүр аудитлагдана
- Нууц үг Argon2/bcrypt, refresh токен SHA-256-аар хадгалагдана (одоо ч тийм)
- Rate limit — нэвтрэх 5/мин, файл байршуулах 20/цаг
- QPay webhook — гарын үсэг/IP шалгалт, идемпотент боловсруулалт
- Backup — Supabase PITR; файлын bucket өдөр тутам

---

## 17. Орчин

| Орчин | Зориулалт |
|---|---|
| local | Docker Redis + Supabase (эсвэл `pnpm db:up:local`) |
| staging | бүрэн хуулбар, QPay sandbox, туршилтын өгөгдөл |
| production | Supabase + тусдаа Redis, өдөр тутмын backup |

CI: `pnpm typecheck && pnpm lint && pnpm test` + `prisma migrate deploy` release дээр.

---

## 18. Нээлттэй асуултууд

`gksedu.md` §24-ийн 5 асуулт хүчинтэй хэвээр. Архитектурын талаас нэмж:

6. **Үлдэгдэл төлбөр ↔ виз дараалал** — §4.1 "виз гарсны дараа үлдэгдэл" vs §9 "үлдэгдэл
   төлөгдсөний дараа визний хэсэг нээгдэнэ". Аль нь үнэн бэ? (одоогийн загвар хоёуланг
   тохиргоогоор дэмжинэ)
7. **Цахим гэрээний хуулийн хүчин төгөлдөр байдал** — OTP-баталгаажуулалт хангалттай юу,
   эсвэл ЭЦС/Дан системийн ЭТГ шаардлагатай юу?
8. **Сургуулийн элсэлтийн шаардлага хэн, хэзээ оруулах вэ** — 135 сургуулийн хөтөлбөр,
   элсэлтийн хугацаа, төлбөр нь дата сангаас ирэхгүй. MVP-д хэдэн сургуулийг бүрэн
   бөглөх вэ?
9. **Файлын хадгалалтын хугацаа** — гэрээ дууссаны дараа хувийн бичиг баримтыг хэдэн жил
   хадгалах вэ (хууль зүйн шаардлага)?
10. **SMS үйлчилгээ үзүүлэгч** — Монголын аль gateway (шимтгэл, дамжуулах хурд)?
11. **Валютын ханшийн албан ёсны эх сурвалж** — Монголбанк нийтийн JSON API нийтлээгүй.
    Одоогоор `FX_RATES_URL` тохиргоогоор нийтийн толин эх сурвалжийг уншиж байна; албан
    ёсны feed эсвэл банктай гэрээт эх сурвалж хэрэгтэй юу? (1E-07)
12. **Хэрэглэгч өөрөө хэрэг нээх бодлого** — одоогийн загварт хэрэглэгч профайлаа бөглөөд
    `POST /me/cases`-ээр өөрөө хэрэг нээж, цахим гэрээгээ үүсгэж болно (зөвлөх хожим
    томилогдоно). Зарим тохиолдолд зөвлөхийн урьдчилсан баталгаа шаардах уу, эсвэл
    үйлчилгээний төрлөөр (жишээ нь GKS тэтгэлэг) хязгаарлах уу? (1C-23)
13. **Визний санхүүгийн нотлох баримтын доод дүн** — визний төрөл, сургуулиас хамаарна
    гэж заасан ч тодорхой дүн бидэнд алга. Дүрмийн `conditionNote`-д бичих үү, эсвэл
    сургууль тус бүрээр тохируулах уу? (1F-03)
14. **GKS-д хамрагдах сургуулийн албан ёсны жагсаалт** — `isGksEligible` ба
    `acceptsLanguagePrep` тугууд импортын дараа 135/135 сургууль дээр `false`, учир нь
    reference dataset энэ мэдээллийг агуулдаггүй. Аль сургууль GKS-д хамрагддаг, аль нь
    хэлний бэлтгэлтэйг бизнес талаас жагсаалтаар авах шаардлагатай (1A-23).
15. **SMS-ийн өдрийн тааз** — одоогоор хэрэглэгч тутам 3, платформ даяар 500 гэж
    тохируулсан (`SMS_DAILY_LIMIT_*`). Gateway сонгогдож, нэгж мессежийн үнэ тодрох үед
    бизнес эдгээрийг батлах ёстой (1G-04).
