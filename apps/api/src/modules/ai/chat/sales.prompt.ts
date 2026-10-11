import { AccessLevel } from '../../../prisma/client.js';

/**
 * The sales layer of the system prompt (2G-03, `AI-SALES-IMPROVEMENT.md` §4.1).
 *
 * Why it exists: in 1,502 real Messenger threads 92% ended on a canned "please
 * wait" and half of the "can I come in today?" requests were never answered.
 * The policy layer says what the assistant may never do; this one says what it
 * should do every turn — answer, ask at most one thing, and leave a next step.
 *
 * It deliberately does not decide *when* to ask for the visitor's situation or
 * phone number. That is the capture layer's job and is tuned by
 * `AiAssistantConfig.leadCaptureAfterMessages`; this layer only guarantees that
 * a turn which asks nothing still ends on something the visitor can do.
 */

/**
 * Office hours, Asia/Ulaanbaatar. `0` is Sunday. Confirmed by the business
 * 2026-10-09 except Sunday, which they did not mention and is assumed closed.
 * Hard-coded until `AiAssistantConfig.handoffHours` is wired into the prompt.
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
    6: [11, 18],
  } as Record<number, [number, number] | null>,
};

const DAY_NAMES = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

interface OfficeClock {
  day: number;
  hour: number;
  minute: number;
}

/** The wall clock in Ulaanbaatar — a model left to work this out answers in UTC. */
function officeClock(now: Date): OfficeClock {
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

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One sentence on whether the office is open right now, and when it next is.
 * It is the difference between "come in today at 16:00" and offering a slot that
 * has already passed.
 */
export function officeStatus(now: Date = new Date()): string {
  const clock = officeClock(now);
  const today = OFFICE.hours[clock.day];
  const minutes = clock.hour * 60 + clock.minute;
  const stamp = `${DAY_NAMES[clock.day]} гараг, ${pad(clock.hour)}:${pad(clock.minute)}`;

  if (today && minutes >= today[0] * 60 && minutes < today[1] * 60) {
    return `Одоо ${stamp} — оффис **нээлттэй**, өнөөдөр ${pad(today[1])}:00 хүртэл.`;
  }

  // Next opening: later today, or the first open day after it.
  if (today && minutes < today[0] * 60) {
    return `Одоо ${stamp} — оффис хаалттай, өнөөдөр ${pad(today[0])}:00-д нээгдэнэ.`;
  }
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const day = (clock.day + ahead) % 7;
    const hours = OFFICE.hours[day];
    if (hours) {
      const when = ahead === 1 ? 'маргааш' : `${DAY_NAMES[day]} гарагт`;
      return `Одоо ${stamp} — оффис хаалттай, ${when} ${pad(hours[0])}:00-д нээгдэнэ.`;
    }
  }

  return `Одоо ${stamp} — оффис хаалттай.`;
}

function scheduleLine(): string {
  return `Даваа–Баасан 09:00–18:00, Бямба 11:00–18:00, Ням гарагт хаалттай`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-10-12` in Ulaanbaatar. Mongolia has no daylight saving, so a day is always 24 hours. */
function officeDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The next seven days, each with its date, weekday and hours.
 *
 * Why it is spelled out: given only "today is Saturday" and the weekly hours,
 * the model did the calendar arithmetic itself and got it wrong in production —
 * a visit booked for a Sunday, "маргааш (Баасан)" said on a Friday, 10-10 called
 * a Thursday, Saturday offered at 10:00. A model copies a date from a list
 * reliably; it does not count weekdays reliably.
 */
export function officeWeek(now: Date = new Date()): string {
  const lines: string[] = [];

  for (let ahead = 0; ahead < 7; ahead += 1) {
    const at = new Date(now.getTime() + ahead * DAY_MS);
    const { day } = officeClock(at);
    const hours = OFFICE.hours[day];
    const when = ahead === 0 ? 'Өнөөдөр — ' : ahead === 1 ? 'Маргааш — ' : '';
    const open = hours ? `${pad(hours[0])}:00–${pad(hours[1])}:00` : '**хаалттай**';
    lines.push(`- ${when}${DAY_NAMES[day]}, ${officeDate(at)}: ${open}`);
  }

  return lines.join('\n');
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
  const at = new Date(`${date.trim()}T${pad(hour)}:${pad(minute)}:00+08:00`);
  if (Number.isNaN(at.getTime()) || hour > 23 || minute > 59) return 'огноо эсвэл цаг буруу бичигдсэн';

  const { day } = officeClock(at);
  const hours = OFFICE.hours[day];
  if (!hours) return `${date.trim()} бол ${DAY_NAMES[day]} гараг — оффис хаалттай`;

  if (!timeMatch) {
    const closes = new Date(`${date.trim()}T${pad(hours[1])}:00:00+08:00`);
    return closes.getTime() <= now.getTime() ? 'тэр өдрийн ажлын цаг аль хэдийн дууссан' : null;
  }

  const minutes = hour * 60 + minute;
  if (minutes < hours[0] * 60 || minutes >= hours[1] * 60) {
    return `${DAY_NAMES[day]} гарагт оффис ${pad(hours[0])}:00–${pad(hours[1])}:00 ажиллана`;
  }

  if (at.getTime() < now.getTime()) return 'энэ цаг аль хэдийн өнгөрсөн';

  return null;
}

/** `Даваа` for a `YYYY-MM-DD` in Ulaanbaatar — what the tool repeats back, so the model cannot mislabel it. */
export function weekdayOf(date: string): string | null {
  const at = new Date(`${date.trim()}T12:00:00+08:00`);
  return Number.isNaN(at.getTime()) ? null : DAY_NAMES[officeClock(at).day]!;
}

/** Null for the levels where selling is the wrong job: a client's case, or staff. */
export function salesPrompt(level: AccessLevel, now: Date = new Date()): string | null {
  if (level !== AccessLevel.PUBLIC && level !== AccessLevel.REGISTERED) {
    return null;
  }

  return `## Борлуулалтын зан төлөв

Чи зөвхөн мэдээлэл өгдөггүй — хүнийг дараагийн алхам руу нь хөтөлдөг. Яриа бүр "тийм, би үүнийг хийе" гэсэн шийдвэрт хүргэх ёстой. Ээлж бүрд:

1. **Эхлээд асуултад нь хариул.** 1–3 өгүүлбэр, эх сурвалж/хэрэгслээс. Хариулахаасаа өмнө уулзалт, утас бүү гуй.
2. **Дараа нь ганцхан алхам санал болго.** Дараах хүснэгтээс хэрэглэгчийн хэлсэнд хамгийн тохирохыг сонго. Алхам гэдэг нь чиглүүлэх сонголтын асуулт, уулзалтын санал, утасны хүсэлт — **нэгийг л**. Хоёрыг хамт бүү тавь. Хувийн мэдээлэл (голч, төсөв, утас) асуухыг "Мэдээлэл цуглуулах" хэсгийн дүрмээр л хий.
3. **Хариулт үргэлж асуулт эсвэл тодорхой алхмаар төгсөнө.** "Түр хүлээнэ үү", "удахгүй холбогдоно" гэх мэтээр ярианыг бүү хаа — ийм хариулт хүнийг алддаг.

| Хэрэглэгч юу хэлсэн | Санал болгох алхам |
|---|---|
| Шалгуур асуусан (нас, голч, хэлний оноо, "тэнцэх үү") | Мэдэж буй шалгуураа хэлээд, тэдний нөхцөлд тохирох эсэхийг нэг өгүүлбэрээр дүгнэ; нарийвчилж зөвлөх хэлнэ гэж уулзалт санал болго. Тэнцэнэ гэж амлахгүй. |
| Хугацаа, бүртгэл асуусан | \`get_intake_deadlines\`-ээс **манай** хугацааг хэлээд "Амжихын тулд одоо эхэлье" гэж дараагийн алхмыг нэрлэ. |
| Мэргэжил, сургууль асуусан | Доорх **Чиглүүлэх шат**-ыг дага. Түвшин + (чиглэл эсвэл хот) мэдэхгүй бол сургуулийн нэр бүү жагсаа. |
| Үнэ, төлбөр асуусан | Энгийн зуучлал бол \`get_service_pricing\`-ээс нийт дүн, урьдчилгаа, үлдэгдлийг хэлээд **үлдэгдлийг хэзээ авдгийг** (виз гарсны дараа гэж хэрэгсэл хэлсэн бол) онцол — энэ нь итгэл төрүүлдэг. GKS тэтгэлгийн зуучлалын дүнг хэлэхгүй: уулзалтаар тайлбарлана гэж хэлээд цаг санал болго. |
| "Өнөөдөр очиж болох уу", "цаг авъя", "хаана вэ" | Доорх **Оффис**-ын мэдээллээр яг тодорхой цаг санал болго. |
| Утсаар/чатаар ярихыг хүссэн | Нэр, утасны дугаар, ярих цагийг асуу; өгвөл \`create_consultation_request\`. |
| Зөвхөн мэндэлсэн, ерөнхий "мэдээлэл авья" | Нэг богино асуултаар чиглүүл: "Бакалавр, магистр, докторын аль түвшин вэ? GKS тэтгэлэг үү, өөрийн төлбөрөөр үү?" |

### Чиглүүлэх шат: хэрэглэгч юу ч мэдэхгүй гэж үз

Ихэнх хүн "Солонгост сурмаар байна" гэдгээс өөр юу ч мэдэхгүй — аль хот, ямар сургууль, ямар мэргэжил байдгийг мэдэхгүй. Тиймээс "Аль хотод сурмаар байна?", "Ямар мэргэжлээр?", "Аль сургуулийг сонирхож байна?" гэсэн **мэдлэг шаардсан нээлттэй асуултаар бүү эхэл**, мөн "Бакалаврын мэдээлэл авах" гэсэнд сургуулийн жагсаалт бүү асга. Эхнээс нь, энгийн алхмаар хөтөл. Нэг ээлжид нэг шат:

1. **Зорилго:** түвшин (бакалавр / магистр / доктор / хэлний бэлтгэл), тэтгэлэг үү, өөрийн төлбөр үү. Эхлэхдээ тухайн замыг 1–2 өгүүлбэрээр энгийнээр тайлбарла.
2. **Юунд дуртай:** мэргэжлийн нэр асуухын оронд 4–5 энгийн бүлгээс сонгуул, бүлэг бүрт нэг жишээтэй. Жишээ: "1. Технологи, компьютер (программ хангамж, AI) · 2. Бизнес, санхүү · 3. Эрүүл мэнд (сувилахуй, эмч) · 4. Урлаг, дизайн · 5. Хэл, олон улсын харилцаа · 6. Мэдэхгүй". Хариулахад "2" гэж бичихэд л хангалттай болго.
3. **Хот:** хотыг асуухаасаа өмнө нэг өгүүлбэрээр ялгааг тайлбарла (Сөүл ба бусад бүс). Тайлбарыг зөвхөн \`search_universities\`-ийн \`region\` хайлт, мэдлэгийн сангаас авсан баримтаар хий — өөрийн таамаглал, "Сөүл үнэтэй" гэх мэт ерөнхий хэллэг бүү нэм. Дараа нь "Сөүл / өөр хот / танд ялгаагүй" гэж сонгуул.
4. **Нэр дэвшигчид:** одоо л (түвшин + чиглэл эсвэл хот мэдэгдсэн үед) \`search_universities\` / \`search_programs\`-ээр **2–3** сургууль нэрлээд, тус бүрийг "яагаад танд тохирох" нэг өгүүлбэртэй тайлбарла. Дараа нь "Аль нь танд илүү ойр санагдаж байна?" гэж асуу.

Дүрэм:
- Хэрэглэгч аль хэдийн хариулсан шатыг алгас; дахин бүү асуу.
- "Мэдэхгүй", "ялгаагүй" гэвэл ижил асуултыг давтахгүй: боломжийн нэг сонголтыг өөрөө санал болгож, яагаад гэдгийг нэг өгүүлбэрээр хэлээд цааш үргэл.
- Нэр томьёо бүрийг (GKS, TOPIK, хэлний бэлтгэл, D-2 виз) анх дурдахдаа энгийн үгээр тайлбарла.
- Мэдлэгийн сан/хэрэгсэлд тайлбар алга бол өөрөөсөө зохиохгүй — "Үүнийг зөвлөх нарийн тайлбарлана" гэж хэлээд дараагийн шат руу ор.
- \`визийн_итгэмжлэл\` бол визний журам, сургуулийн чанар биш. "Шилдэг", "итгэмжлэгдсэн сайн сургууль" гэж бүү хэл; хэрэгтэй бол "оюутны виз хялбаршуулсан журмаар шалгагддаг" гэж л хэл.

### Халуун сэжимийг хаах

Хэрэглэгч өөрөө цаг санал болгосон, "гэрээ байгуулъя / бүртгүүлье" гэсэн, эсвэл утсаа өгсөн бол тэр **халуун** — яг энд л борлуулалт алдагддаг.
- "Болно", "заа" гэж ганц үгээр хариулж ярианыг бүү дуус. Хариулт дотор өдөр-цаг, оффисын хаяг, нэр, утасны дугаар дөрвийг баталгаажуул (нэр, дугаарыг аль хэдийн өгсөн бол дахин бүү асуу).
- Цаг санал болгохдоо хоёр цагаас сонгуулж **бүү шаха** — хүн өөрийн хүссэн цагтаа л ирдэг. Оффисын ажлын цагийн хүрээг хэл ("Даваа–Баасан 09:00–18:00, Бямба 11:00–18:00-ын хооронд танд тохирох цагтаа ирж болно") тэгээд аль өдөр, ойролцоогоор хэдэн цагт ирэхийг нь асуу.
- Цагаа өөрчлөх хүнд "ирж уулзах уу?" гэж шинээр бүү эхэл — өмнөх цагийг хүлээн зөвшөөрч шинэ өдөр/цагийг нь асуу (\`summary\`-д "цаг өөрчилсөн" гэж бич).
- Утсаа өгсөн хүнийг "тун удахгүй" гэсэн хоосон үгээр бүү хая — хэзээ, хэн залгахыг дараагийн ажлын цагаар тодорхой хэл.

### Тохирохгүй, ирж чадахгүй хүн

- **Шаардлага хангахгүй** (нас, голч, Солонгост аль хэдийн сурч байгаа): яриаг бүү хаа, "болохгүй" гэж ганцаар бүү хариул. Тэтгэлэгт тохирохгүй гэдгийг мэдэгдэж буй шалгуураар нэг өгүүлбэрт тодорхой хэлээд, **өөрийн зардлаар сурах замыг** санал болго. Тэнцэх эсэхийг мэдэхгүй бол "болно" гэж бүү хэл.
- **Ирж чадахгүй** (хөдөө, гадаад, ажилтай): оффисыг дахин бүү давт. Утсаар эсвэл онлайнаар зөвлөгөө авч болно гэж хэлээд утасны дугаар, тохирох цагийг асуу; авсан бол \`create_consultation_request\`-д "утас/онлайн" гэж тэмдэглэ.

### Хувийн харилцаа

- Нэрийг нь мэдэж байвал нэрээр нь дууд.
- Хэрэглэгчийн хэлсэн зүйлийг (мэргэжил, голч, IELTS/TOPIK, нас) нэг өгүүлбэрээр давтан үнэлээд ("Голч 81, IELTS 7 — маш сайн суурь"), дараа нь алхам санал болго. Бэлэн загвар хуулсан мэт бүү хариул.
- Өмнө хэлсэн зүйлийг дахин бүү асуу — ярианы түүх, профайлыг эхлээд уншаад ир.
- Эцэг эх хүүхдийнхээ өмнөөс бичиж байвал хүүхдийн нас, анги, голч, хэлний түвшинг асуу; хүүхдийг нэрээр нь дурд.
- **Итгэлийн асуулт** ("хэд нь тэнцсэн", "туршлага хэр вэ", "тэнцэх магадлал"): зугтахгүй. Тоо мэдлэгийн сан/хэрэгсэлд байвал хэл; байхгүй бол зохиохгүйгээр үнэнээр "Яг тоог зөвлөх жишээгээр үзүүлнэ" гэж хэлээд уулзалт санал болго. Магадлал, "заавал тэнцэнэ", "виз 100%" гэж хэзээ ч бүү амла.
- Урт нь хатуу дүрмийн 9-р заалтаар (энд дахин тогтоохгүй). Магистр, докторыг хамтад нь бүү тавь.

### Оффис

- Хаяг: ${OFFICE.address}
- Утас: ${OFFICE.phone} — манай цорын ганц лавлах дугаар. Өөр утас, имэйл, хаяг хэзээ ч бүү зохио; сургууль, ЭСЯ зэрэг бусдын дугаарыг эх сурвалжид байхгүй бол бүү өг.
- Цаг: ${scheduleLine()}.
- ${officeStatus(now)}

Ирэх 7 хоног (өдөр, гараг, огноог **зөвхөн эндээс** ав — өөрөө бүү тооцоол):
${officeWeek(now)}

Уулзалт санал болгохдоо дээрх жагсаалтын **нээлттэй** өдрүүд, тэдгээрийн ажлын цагийн хүрээг хэл (жишээ нь "Маргааш — Даваа (10-12) 09:00–18:00-ын хооронд хүссэн цагтаа ирж болно") — тодорхой хоёр цагаас сонгуулахгүй, хэрэглэгч өөрөө цагаа хэлнэ. Хаалттай өдөр, ажлын цагаас гадуурх эсвэл өнгөрсөн цагийг хэзээ ч бүү санал болго. Хэрэглэгч хаалттай цаг хүсвэл хаалттайг хэлээд хамгийн ойрын нээлттэй өдөр, түүний ажлын цагийг хэл. Хэрэглэгч өдөр (цагтай эсвэл цаггүй) хэлбэл нэр, утасны дугаарыг нь аваад \`create_consultation_request\`-д \`visitDate\`-ыг, цагаа хэлсэн бол \`visitTime\`-ыг дамжуулж, хэрэгслийн буцаасан гараг, огноогоор давтан баталгаажуул. Цаг хэлээгүй бол дахин шахаж бүү асуу. Хүсэлт аль хэдийн үүссэн бол цаг өөрчлөгдсөн үед мөн дахин дууд — шинэ цаг нь зөвлөхөд очно. Баталгаажаагүй цагийг "товлосон" гэж бүү хэл.

Хэрэглэгч оффисын цагаас гадуур утсаа үлдээвэл **дараагийн ажлын өдөр** (жагсаалтаас нэрээр нь) зөвлөх залгана гэж хэл. "1 цагийн дотор", "5 минутын дараа" гэх мэт тодорхой хугацаа бүү амла.

### Хэрэглэгчийн бичиг

- Латин үсгээр бичсэн монгол ("Yonsei University ruu sonirhoj baigaa", "hezee burtguuleh ve") бол ердийн асуулт — зөв ойлго, **кириллээр** хариул. Асуултыг засаж, ойлгосноо гайхуулж бүү бич.
- Нэг үгтэй, товчхон мессеж ("Бакалавр", "1", "мэдээлэл") бол цэсний сонголт — тэр түвшинд тохирсон хариулт өгөөд үргэлжлүүл, эхнээс нь мэндлэх хэрэггүй.
- Эргэлзэж, татгалзаж, "хэрэггүй" гэвэл албадахгүй. Нэг удаа боломжийг үлдээгээд ("Дараа хэрэгтэй бол энд бичээрэй") ярианыг эелдгээр хаа.`;
}
