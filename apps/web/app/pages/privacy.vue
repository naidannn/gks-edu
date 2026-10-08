<script setup lang="ts">
import type { LegalSection } from '~/components/legal/Document.vue';

/**
 * 1A-33 — Нууцлалын бодлого.
 *
 * Every claim here is checked against what the system actually does, because a
 * privacy policy that promises more than the code delivers is worse than none:
 *   · the categories in §2 are the columns of `Lead`, `Client` and
 *     `DocumentFile` in `schema.prisma`, not a generic list;
 *   · §5 names the processors that are actually wired up today (Supabase,
 *     Resend, QPay, Google) — an SMS gateway is deliberately absent, it is
 *     still unchosen (`ARCHITECTURE.md` §18 асуулт 10);
 *   · §9 describes the safeguards that exist (hashed passwords, role guards,
 *     signed storage URLs, audit log), not aspirational ones;
 *   · §10 says the session is kept in localStorage rather than a cookie,
 *     which is what `stores/auth.ts` does, and GA4 only loads when
 *     `NUXT_PUBLIC_GA_ID` is set.
 *
 *   · §§ «Facebook» and «AI туслах» (2F, 2B) describe the Page integration and
 *     the assistant as built: the page-scoped id, name and picture Meta hands
 *     us, the messages and comments stored in `facebook_messages` /
 *     `facebook_comments`, and the two model providers `LlmService` routes to
 *     (Gemini first, DeepSeek as fallback). Meta's App Review reads this page,
 *     which is also why it closes with an English summary.
 *
 * The retention period below is the one number here that is a business
 * decision rather than an observed fact — see `ARCHITECTURE.md` §18 асуулт 9.
 */
const LEAD_RETENTION = '2 жил';

const SECTIONS: LegalSection[] = [
  {
    id: 'general',
    title: 'Ерөнхий заалт',
    blocks: [
      {
        type: 'p',
        text: `${COMPANY.legalName} нь gksedu.mn платформоор дамжуулан цуглуулсан хувь хүний мэдээллийг Монгол Улсын Хувь хүний мэдээлэл хамгаалах тухай хууль болон холбогдох бусад хууль тогтоомжийн дагуу боловсруулна.`,
      },
      {
        type: 'p',
        text: 'Энэхүү бодлого нь бид ямар мэдээлэл цуглуулдаг, юунд ашигладаг, хэнд дамжуулдаг, хэр удаан хадгалдаг, та ямар эрхтэй болохыг тайлбарлана.',
      },
      {
        type: 'p',
        text: `Мэдээлэл хариуцагч: ${COMPANY.legalName}. Хаяг: ${COMPANY.addressOneLine}. Утас: ${COMPANY.phoneLabel}. И-мэйл: ${COMPANY.email}.`,
      },
    ],
  },
  {
    id: 'collected',
    title: 'Цуглуулдаг мэдээлэл',
    blocks: [
      {
        type: 'p',
        text: 'Үйлчилгээний үе шатаас хамааран дараах мэдээллийг цуглуулна. Үе шат бүрд зөвхөн тухайн ажилд шаардлагатай мэдээллийг л асууна.',
      },
      {
        type: 'list',
        items: [
          'Зөвлөгөө хүсэх үед: овог, нэр, утас, и-мэйл, нас, боловсролын түвшин, голч дүн, хэлний түвшин, сонирхож буй сургууль, мэргэжил, үйлчилгээ, бидэнтэй холбогдсон суваг.',
          'Гэрээ байгуулах үед: төрсөн огноо, регистрийн дугаар, хүйс, оршин суугаа хаяг, нэмэлт утас, эцэг эх/асран хамгаалагчийн мэдээлэл (18-аас доош насны бол), гадаад паспортын дугаар, хүчинтэй хугацаа.',
          'Материал бүрдүүлэлтийн үед: паспорт, боловсролын үнэмлэх, дүнгийн жагсаалт, хэлний түвшний гэрчилгээ, санхүүгийн баримт, эрүүл мэндийн болон бусад шаардлагатай бичиг баримтын хуулбар.',
          'Бүртгэлийн мэдээлэл: и-мэйл хаяг, нууц үгийн шифрлэсэн хэлбэр, Google-ээр нэвтэрсэн бол Google-ийн бүртгэлийн танигч.',
          'Төлбөрийн мэдээлэл: төлбөрийн дүн, огноо, гүйлгээний дугаар, төлөв. Банкны карт эсвэл дансны нууц мэдээлэл бидэнд ирдэггүй — түүнийг төлбөрийн үйлчилгээ үзүүлэгч боловсруулна.',
          'Харилцааны түүх: зөвлөхтэй бичсэн чат, AI туслахтай хийсэн яриа, илгээсэн мэдэгдэл, дуудлагын тэмдэглэл.',
          'Facebook-ээр холбогдсон бол: манай Facebook хуудас (Page)-ны хүрээнд Meta-гийн олгодог танигч (page-scoped ID), Facebook дээрх нэр, профайл зураг, Messenger-ээр бичсэн мессеж, хавсралт, манай постны доор бичсэн сэтгэгдэл, таныг манай хуудас руу авчирсан зар/холбоосын мэдээлэл.',
          'Техникийн мэдээлэл: IP хаяг, төхөөрөмж, хөтчийн төрөл, зочилсон хуудас — үйлчилгээний аюулгүй байдал, статистикийн зорилгоор.',
        ],
      },
      {
        type: 'note',
        text: 'Бид зөвхөн танд шууд хамаарах, эсхүл таны зөвшөөрсөн этгээдийн (жишээ нь асран хамгаалагч) мэдээллийг л хүлээн авна. Бусдын бичиг баримтыг зөвшөөрөлгүйгээр байршуулахыг хориглоно.',
      },
    ],
  },
  {
    id: 'purpose',
    title: 'Юунд ашигладаг вэ',
    blocks: [
      {
        type: 'list',
        items: [
          'Танд тохирох сургууль, хөтөлбөр, тэтгэлгийг судалж зөвлөгөө өгөх.',
          'Зуучлалын гэрээ байгуулах, төлбөр бүртгэх, баримт олгох.',
          'Шаардлагатай материалын жагсаалт гаргах, бүрдүүлэлтийг хянах, орчуулга, баталгаажуулалт зохион байгуулах.',
          'Сургуульд мэдүүлэг хүргүүлэх, элсэлтийн явцыг хянах, урилга авах.',
          'Виз мэдүүлэх материалыг бүрдүүлэх, зорчих бэлтгэлийг зохион байгуулах.',
          'Хугацаа, дараагийн алхмын сануулга, мэдэгдэл илгээх.',
          'Үйлчилгээний чанарыг сайжруулах, статистик, дотоод тайлан гаргах (хувь хүн тодорхойлохгүй хэлбэрээр).',
          'Хууль тогтоомжоор хүлээсэн үүргээ биелүүлэх.',
        ],
      },
      {
        type: 'p',
        text: 'Таны урьдчилсан зөвшөөрөлгүйгээр зураг, амжилтын мэдээллийг сурталчилгаанд ашиглахгүй (Гэрээний 3.2).',
      },
    ],
  },
  {
    id: 'facebook',
    title: 'Facebook хуудас ба Messenger',
    blocks: [
      {
        type: 'p',
        text: `${COMPANY.name}-ийн Facebook хуудас руу Messenger-ээр бичих, эсвэл манай постны доор сэтгэгдэл үлдээхэд Meta Platforms тухайн мессеж, сэтгэгдлийг манай платформд дамжуулдаг. Бид дараах зорилгоор л ашиглана:`,
      },
      {
        type: 'list',
        items: [
          'Таны асуултад хариулах — AI туслах эсвэл манай зөвлөх Messenger-ээр хариу бичнэ.',
          'Сэтгэгдэлд хариулах — асуулт агуулсан сэтгэгдэлд дэлгэрэнгүй хариуг Messenger-ээр хувиар илгээж, сэтгэгдлийн доор богино мэдэгдэл үлдээнэ. Үнэ, хувийн мэдээлэл нийтэд бичигдэхгүй.',
          'Та зөвлөгөө хүсэж утасны дугаараа өөрөө өгсөн бол зөвлөх тан руу залгах хүсэлт бүртгэх, ярианы түүхийг таны хүсэлттэй холбох.',
          'Үйлчилгээний чанарыг сайжруулах — ажилтны сайн хариултыг нэргүйжүүлж, AI туслахын мэдлэгийн санд ашиглаж болно.',
        ],
      },
      {
        type: 'p',
        text: 'Бид Facebook-ийн найзуудын жагсаалт, таны хувийн хуудасны пост, бусад хуудастай харилцсан түүх зэргийг авдаггүй. Facebook-ээс ирсэн мэдээллийг худалдахгүй, сурталчилгааны зорилгоор гуравдагч этгээдэд дамжуулахгүй.',
      },
      {
        type: 'note',
        text: 'Facebook-ээр бидэнтэй харилцсан түүхээ устгуулах бол «Өгөгдөл устгах заавар» хуудсыг (gksedu.mn/data-deletion) үзнэ үү.',
      },
    ],
  },
  {
    id: 'assistant',
    title: 'AI туслах',
    blocks: [
      {
        type: 'p',
        text: 'Вэбсайт болон Facebook Messenger дээрх AI туслах нь таны асуултыг хиймэл оюуны хэлний загвар ашиглан боловсруулж хариулдаг. Хариулт үүсгэхийн тулд таны бичсэн мессеж, ярианы өмнөх хэсэг, манай мэдлэгийн сангийн холбогдох хэсгийг загварын үйлчилгээ үзүүлэгч рүү илгээнэ.',
      },
      {
        type: 'list',
        items: [
          'Загварын үйлчилгээ үзүүлэгч: Google (Gemini), нөөц хувилбараар DeepSeek. Тэд мэдээллийг зөвхөн хариулт үүсгэхэд боловсруулна.',
          'Үнэ, хугацаа зэрэг тоог AI санаж хэлэхгүй, манай системийн бодит өгөгдлөөс уншиж хэлдэг. Гэсэн ч AI-ийн хариулт алдаатай байж болох тул чухал шийдвэр гаргахаасаа өмнө зөвлөхтэй баталгаажуулна уу.',
          'Ажилтан ярианд оролцох бүрд AI тухайн ярианд түр хариулахаа зогсоодог. Хүнтэй ярих хүсэлтэй бол хэдийд ч бичээрэй.',
          'Утасны дугаараа өгөх эсэх нь таны сонголт; AI дугаарыг зөвхөн таны зөвшөөрлөөр зөвлөгөөний хүсэлтэд бүртгэнэ.',
        ],
      },
    ],
  },
  {
    id: 'basis',
    title: 'Боловсруулах хууль зүйн үндэслэл',
    blocks: [
      {
        type: 'list',
        items: [
          'Таны зөвшөөрөл — зөвлөгөө хүсэх маягт бөглөх, бүртгэл үүсгэх үед.',
          'Гэрээ байгуулах, гүйцэтгэх шаардлага — зуучлалын үйлчилгээ үзүүлэхэд зайлшгүй мэдээлэл.',
          'Хууль тогтоомжоор хүлээсэн үүрэг — санхүү, татвар, архивын бүртгэл.',
        ],
      },
    ],
  },
  {
    id: 'sharing',
    title: 'Хэнд дамжуулдаг вэ',
    blocks: [
      {
        type: 'p',
        text: 'Мэдээллийг зөвхөн үйлчилгээг гүйцэтгэхэд зайлшгүй шаардлагатай хэмжээгээр, зорилгын хүрээнд дамжуулна (Гэрээний 7.2).',
      },
      {
        type: 'list',
        items: [
          'БНСУ-ын их, дээд сургууль, хэлний бэлтгэлийн төв — мэдүүлэг, элсэлтийн материал.',
          'БНСУ-ын Элчин сайдын яам, консулын газар — визний материал.',
          'Орчуулгын товчоо, нотариат, апостилын үйлчилгээ — баталгаажуулалт шаардсан баримт.',
          'Шуудан, буухиа шуудангийн байгууллага — цаасан материал хүргүүлэх.',
          'Төлбөрийн үйлчилгээ үзүүлэгч (QPay) болон банк — төлбөр хүлээн авах, баталгаажуулах.',
          'И-мэйл илгээх үйлчилгээ үзүүлэгч — мэдэгдэл, баталгаажуулалтын захидал.',
          'Үүлэн дэд бүтцийн үйлчилгээ үзүүлэгч — мэдээллийн сан болон файл хадгалалт.',
          'Google — та Google бүртгэлээрээ нэвтрэхийг сонгосон тохиолдолд.',
          'Meta Platforms (Facebook, Messenger) — та манай Facebook хуудастай харилцсан тохиолдолд мессеж хүлээн авах, хариу илгээх.',
          'Хиймэл оюуны загварын үйлчилгээ үзүүлэгч (Google Gemini, DeepSeek) — AI туслахын хариулт үүсгэх.',
          'Эрх бүхий төрийн байгууллага — хуульд заасан үндэслэл, журмын дагуу.',
        ],
      },
      {
        type: 'note',
        text: 'Бид таны хувийн мэдээллийг гуравдагч этгээдэд худалдахгүй, сурталчилгааны зорилгоор бусдад дамжуулахгүй.',
      },
    ],
  },
  {
    id: 'cross-border',
    title: 'Хилийн чанад дахь дамжуулалт',
    blocks: [
      {
        type: 'p',
        text: 'Зуучлалын мөн чанараас шалтгаалан таны материал БНСУ-ын сургууль болон Элчин сайдын яаманд дамжина. Мөн платформын мэдээллийн сан, файл хадгалалт нь олон улсын үүлэн үйлчилгээний Сингапур дахь дата төвд байрлана.',
      },
      {
        type: 'p',
        text: 'Дамжуулалт бүр нь тухайн үйлчилгээг гүйцэтгэхэд зайлшгүй шаардлагатай хэмжээгээр хийгдэнэ.',
      },
    ],
  },
  {
    id: 'retention',
    title: 'Хадгалах хугацаа',
    blocks: [
      {
        type: 'list',
        items: [
          `Гэрээ байгуулаагүй зөвлөгөөний хүсэлтийн мэдээллийг сүүлийн харилцаанаас хойш ${LEAD_RETENTION} хадгалж, дараа нь устгана.`,
          'Гэрээ, төлбөр, нягтлан бодох бүртгэлийн баримтыг хууль тогтоомжид заасан хугацаанд хадгална.',
          'Байршуулсан бичиг баримтыг үйлчилгээний хугацаанд болон гэрээ дуусгавар болсны дараа хуулиар шаардсан хугацаанд хадгална.',
          'Хувийн буланг устгах хүсэлт гаргасан тохиолдолд хуулиар хадгалах үүрэгтэй баримтаас бусад мэдээллийг устгана.',
          'Facebook Messenger, сэтгэгдэл болон AI туслахтай хийсэн ярианы түүхийг сүүлийн харилцаанаас хойш 1 жил хадгалж, дараа нь устгана. Устгах хүсэлт ирвэл 30 хоногийн дотор устгана.',
        ],
      },
    ],
  },
  {
    id: 'rights',
    title: 'Таны эрх',
    blocks: [
      {
        type: 'list',
        items: [
          'Бид таны талаар ямар мэдээлэл хадгалж байгааг мэдэх, түүнтэй танилцах.',
          'Буруу, дутуу мэдээллийг засварлуулах, шинэчлүүлэх.',
          'Хуульд заасан үндэслэлээр мэдээллээ устгуулах.',
          'Өмнө өгсөн зөвшөөрлөө хэдийд ч татах — энэ тохиолдолд үйлчилгээний зарим хэсэг үргэлжлэх боломжгүй болохыг анхаарна уу.',
          'Мэдээллээ уншиж болохуйц хэлбэрээр хүлээн авах.',
          'Эрх зөрчигдсөн гэж үзвэл эрх бүхий байгууллагад гомдол гаргах.',
        ],
      },
      {
        type: 'p',
        text: `Эдгээр эрхээ хэрэгжүүлэхийн тулд ${COMPANY.email} хаягаар эсвэл ${COMPANY.phoneLabel} дугаараар хандана уу. Хүсэлтийг хуульд заасан хугацаанд шийдвэрлэж, хариу мэдэгдэнэ. Хүсэлт гаргагчийг таних шаардлагатай тул бид нэмэлт баталгаажуулалт хүсэж болно.`,
      },
    ],
  },
  {
    id: 'security',
    title: 'Хамгаалалт',
    blocks: [
      {
        type: 'list',
        items: [
          'Вэбсайт болон бүх дамжуулалт HTTPS/TLS шифрлэлттэй.',
          'Нууц үгийг буцаан задлах боломжгүй хэлбэрээр хадгална.',
          'Байршуулсан бичиг баримт нь хаалттай сангад хадгалагдаж, зөвхөн хугацаатай, гарын үсэгтэй холбоосоор нээгдэнэ.',
          'Ажилтан зөвхөн өөрт хуваарилагдсан хэргийн мэдээлэлд, ажлын шаардлагын хүрээнд хандана.',
          'Мэдээлэлд орсон чухал өөрчлөлт бүр аудитын бүртгэлд тэмдэглэгдэнэ.',
        ],
      },
      {
        type: 'p',
        text: 'Аюулгүй байдлын зөрчил илэрсэн тохиолдолд бид нөлөөлөлд өртсөн хэрэглэгчид болон эрх бүхий байгууллагад хуульд заасан журмын дагуу мэдэгдэнэ.',
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Күүки ба хэмжилт',
    blocks: [
      {
        type: 'p',
        text: 'Нэвтрэлтийн төлөвийг бид таны хөтчийн дотоод санах ойд (localStorage) хадгалдаг тул платформ өөрөө нэвтрэлтийн күүки үүсгэдэггүй. Энэ өгөгдөл зөвхөн таны төхөөрөмж дээр байрлана.',
      },
      {
        type: 'p',
        text: 'Вэбсайтын хэрэглээний ерөнхий статистикийг хэмжихэд Google Analytics ашиглаж болзошгүй бөгөөд энэ тохиолдолд Google өөрийн күүки үүсгэнэ. Хөтчийнхөө тохиргоогоор күүкиг хааж болно.',
      },
    ],
  },
  {
    id: 'children',
    title: 'Хүүхдийн мэдээлэл',
    blocks: [
      {
        type: 'p',
        text: '18 нас хүрээгүй хэрэглэгчийн мэдээллийг зөвхөн эцэг эх, асран хамгаалагчийн зөвшөөрөлтэйгээр боловсруулна. Асран хамгаалагч хүүхдийнхээ мэдээлэлтэй танилцах, засварлуулах, устгуулах эрхтэй.',
      },
    ],
  },
  {
    id: 'english',
    title: 'English summary',
    blocks: [
      {
        type: 'p',
        text: `This policy is written in Mongolian; this section summarises it in English. The data controller is ${COMPANY.legalName} (GKS EDU GROUP LLC), ${COMPANY.addressOneLine}, Mongolia. Contact: ${COMPANY.email}, ${COMPANY.phone}.`,
      },
      {
        type: 'list',
        items: [
          'What we collect: the details you give us when asking for a consultation or signing a contract (name, phone, email, education, documents needed for a Korean university application and visa), payment records, and the history of your conversations with our consultants and our AI assistant.',
          'Facebook: when you message our Facebook Page or comment on our posts, Meta sends us your page-scoped ID, your Facebook name and profile picture, your messages, attachments and comments, and the ad or link that brought you to us. We use them only to answer you (by our AI assistant or a staff member), to register a consultation request when you give us your phone number, and to improve our answers. We do not access your friends list or personal posts, and we never sell or share Facebook data for advertising.',
          'AI assistant: replies are generated by large language models from Google (Gemini) and, as a fallback, DeepSeek, which process your message only to produce the reply. Any staff reply pauses the assistant in that conversation.',
          'Sharing: only as needed to provide the service — Korean universities, the Korean embassy, translators/notaries, couriers, our payment provider (QPay), email and cloud-hosting providers, Meta, and the AI providers above. We never sell personal data.',
          'Retention: unconverted enquiries for 2 years; Facebook and AI chat history for 1 year after the last message; contracts and payments as required by law.',
          'Your rights: access, correction, deletion and withdrawal of consent. To delete your Facebook conversation data, follow https://gksedu.mn/data-deletion or write to us; we delete it within 30 days.',
        ],
      },
    ],
  },
  {
    id: 'changes',
    title: 'Бодлогын өөрчлөлт',
    blocks: [
      {
        type: 'p',
        text: 'Хууль тогтоомж, үйлчилгээний өөрчлөлтөөс шалтгаалан энэхүү бодлогод өөрчлөлт оруулж болно. Шинэчилсэн хувилбарыг энэ хуудсанд нийтэлж, шинэчилсэн огноог тэмдэглэнэ. Мэдээллийг боловсруулах зорилго үндсээр өөрчлөгдвөл бид танаас дахин зөвшөөрөл авна.',
      },
    ],
  },
];

useHead({ title: 'Нууцлалын бодлого' });
useSeoMeta({
  description:
    'GKS EDU GROUP таны хувийн мэдээллийг хэрхэн цуглуулж, ашиглаж, хамгаалдаг тухай. Дамжуулалт, хадгалах хугацаа, таны эрх.',
  ogTitle: 'Нууцлалын бодлого · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <LegalDocument
    eyebrow="Хууль зүйн мэдээлэл"
    title="Нууцлалын бодлого"
    lede="Элсэлтийн материал гэдэг бол паспорт, дүнгийн жагсаалт, санхүүгийн баримт — таны хамгийн эмзэг бичиг баримтууд. Бид тэдгээрийг яг юунд ашигладаг, хэнд дамжуулдаг, хэр удаан хадгалдгийг энд нуулгүй бичив."
    :sections="SECTIONS"
  />
</template>
