import type { AiChatCard, AiChatSessionSummary, ServiceType } from '@gks/shared';

/**
 * What the assistant offers to do next, and how its past conversations are
 * grouped (2C-13).
 *
 * The next step is decided here, from the cards an answer carried, rather than
 * by the model. A card is the database speaking — a school, a round, a price —
 * so what is worth doing after it is knowable without asking anyone: after a
 * school, its programmes and its deadline; after a price, the contract. Rules
 * cost nothing, never invent a school, and give every answer a way forward,
 * which is the point (AI-ASSISTANT.md §6.4). Pulled out of the components so
 * they can be tested — `$fetch` cannot be mocked in this app's tests, and none
 * of this needs it.
 */

/**
 * One button under an answer.
 *
 * `ask` puts a question into the conversation on the visitor's behalf — the
 * label is what the chip says, the prompt is what gets sent, and the two differ
 * because a chip has to be three words while a question has to name its school.
 * `link` leaves the chat for the page that does the thing.
 */
export type AiChatAction =
  | { kind: 'ask'; label: string; prompt: string; icon: string }
  | AiChatLinkAction;

export interface AiChatLinkAction {
  kind: 'link';
  label: string;
  to: string;
  icon: string;
  primary?: boolean;
}

export interface AiChatContext {
  signedIn: boolean;
}

/** At most this many chips under an answer — past four, nobody reads them. */
const MAX_NEXT_STEPS = 4;

/** `/app/start`, with whatever the conversation already settled. */
export function startCaseLink(params: { university?: string; intakeId?: string; service?: ServiceType } = {}): string {
  const query = new URLSearchParams();
  if (params.service) query.set('service', params.service);
  if (params.university) query.set('university', params.university);
  if (params.intakeId) query.set('intakeId', params.intakeId);
  const search = query.toString();
  return search ? `/app/start?${search}` : '/app/start';
}

export function consultationLink(params: { university?: string; service?: ServiceType } = {}): string {
  const query = new URLSearchParams();
  if (params.service) query.set('service', params.service);
  if (params.university) query.set('university', params.university);
  const search = query.toString();
  return search ? `/consultation?${search}` : '/consultation';
}

/** A person: the messenger for someone signed in, the request form for a guest. */
function humanLink(context: AiChatContext): AiChatLinkAction {
  return context.signedIn
    ? { kind: 'link', label: 'Зөвлөхтэй чатлах', to: '/messages', icon: 'message-circle' }
    : { kind: 'link', label: 'Зөвлөгөө авах', to: '/consultation', icon: 'phone' };
}

/** The one school every item of a list belongs to, if there is exactly one. */
function singleSchool(slugs: string[]): string | undefined {
  const unique = new Set(slugs);
  return unique.size === 1 ? slugs[0] : undefined;
}

function stepsFor(card: AiChatCard, context: AiChatContext): AiChatAction[] {
  switch (card.type) {
    case 'university': {
      const school = card.data;
      return [
        {
          kind: 'ask',
          label: 'Хөтөлбөр, төлбөр',
          prompt: `${school.nameMn} — ямар хөтөлбөрүүд байдаг, жилийн төлбөр хэд вэ?`,
          icon: 'graduation-cap',
        },
        {
          kind: 'ask',
          label: 'Элсэлтийн хугацаа',
          prompt: `${school.nameMn} — дараагийн элсэлт хэзээ, бүртгэл хэзээ хаагдах вэ?`,
          icon: 'calendar-clock',
        },
        {
          kind: 'link',
          label: 'Гэрээ байгуулах',
          to: startCaseLink({ university: school.slug }),
          icon: 'file-pen-line',
          primary: true,
        },
      ];
    }

    case 'universities': {
      // The answer under a list nearly always ends on "which one interests
      // you?" — so the first two schools are the reply, one tap each.
      const picks = card.data.items.slice(0, 2).map(
        (item): AiChatAction => ({
          kind: 'ask',
          label: item.nameMn,
          prompt: `${item.nameMn} — дэлгэрэнгүй мэдээлэл өгөөч`,
          icon: 'building-2',
        }),
      );
      return [
        ...picks,
        ...(card.data.items.length > 1
          ? [
              {
                kind: 'ask' as const,
                label: 'Харьцуулах',
                prompt: 'Эдгээр сургуулийг төлбөр, рейтинг, элсэлтийн хугацаагаар харьцуулж өгөөч',
                icon: 'scale',
              },
            ]
          : []),
        { ...humanLink(context), primary: true },
      ];
    }

    case 'programs': {
      const school = singleSchool(card.data.items.map((item) => item.university.slug));
      const schoolName = card.data.items[0]?.university.nameMn;
      return [
        {
          kind: 'ask',
          label: 'Төгрөгөөр хэд вэ?',
          prompt: 'Энэ төлбөр төгрөгөөр хэд болох вэ?',
          icon: 'banknote',
        },
        {
          kind: 'ask',
          label: 'Тэтгэлэг',
          prompt: 'Эдгээр хөтөлбөрт тэтгэлэг авах боломж бий юу?',
          icon: 'award',
        },
        ...(school && schoolName
          ? [
              {
                kind: 'ask' as const,
                label: 'Элсэлтийн хугацаа',
                prompt: `${schoolName} — дараагийн элсэлт хэзээ хаагдах вэ?`,
                icon: 'calendar-clock',
              },
            ]
          : []),
        {
          kind: 'link',
          label: 'Зөвлөгөө авах',
          to: consultationLink({ university: school }),
          icon: 'phone',
          primary: true,
        },
      ];
    }

    case 'intakes': {
      const school = singleSchool(card.data.items.map((item) => item.university.slug));
      return [
        {
          kind: 'ask',
          label: 'Ямар материал хэрэгтэй?',
          prompt: 'Бүртгүүлэхэд ямар материал бүрдүүлэх вэ?',
          icon: 'folder-open',
        },
        {
          kind: 'ask',
          label: 'Үйлчилгээний үнэ',
          prompt: 'Танай зуучлалын үйлчилгээний үнэ хэд вэ?',
          icon: 'receipt',
        },
        {
          kind: 'link',
          label: 'Бүртгэл эхлүүлэх',
          to: startCaseLink({ university: school }),
          icon: 'file-pen-line',
          primary: true,
        },
      ];
    }

    case 'pricing':
      return [
        {
          kind: 'ask',
          label: 'Юу багтдаг вэ?',
          prompt: 'Гэрээнд ямар үйлчилгээ багтдаг вэ?',
          icon: 'list-checks',
        },
        {
          kind: 'ask',
          label: 'Хэрхэн төлөх вэ?',
          prompt: 'Урьдчилгаа төлбөрийг хэрхэн төлөх вэ?',
          icon: 'credit-card',
        },
        {
          kind: 'link',
          label: 'Гэрээ байгуулах',
          to: startCaseLink({ service: card.data.serviceType }),
          icon: 'file-pen-line',
          primary: true,
        },
      ];

    case 'fx':
      return [
        {
          kind: 'ask',
          label: 'Нэг жилийн зардал',
          prompt: 'Солонгост нэг жил сурах нийт зардал (сургалт, байр, амьжиргаа) төгрөгөөр хэд вэ?',
          icon: 'wallet',
        },
        humanLink(context),
      ];
  }
}

/** What an answer with no card leads to: the two questions that sell, and a person. */
function generalSteps(context: AiChatContext): AiChatAction[] {
  return [
    {
      kind: 'ask',
      label: 'Надад тохирох сургууль',
      prompt: 'Миний нөхцөлд тохирох сургуулийг санал болгооч',
      icon: 'sparkles',
    },
    {
      kind: 'ask',
      label: 'Үйлчилгээний үнэ',
      prompt: 'Танай зуучлалын үйлчилгээний үнэ хэд вэ?',
      icon: 'receipt',
    },
    humanLink(context),
  ];
}

/**
 * The chips under the latest answer.
 *
 * The *last* card leads: an answer that looked a school up and then its
 * deadlines is about the deadlines by the end. A question the visitor already
 * asked is not offered again. Duplicates by label go, and a
 * second link loses to the first — two "leave the chat" buttons under one
 * answer is a choice nobody asked for.
 */
export function aiNextSteps(
  cards: AiChatCard[],
  context: AiChatContext,
  /** Questions already in this thread — a chip that repeats one is a dead end. */
  asked: string[] = [],
): AiChatAction[] {
  const last = cards[cards.length - 1];
  const candidates = last ? stepsFor(last, context) : generalSteps(context);
  const already = new Set(asked.map((question) => question.trim()));

  const seen = new Set<string>();
  let linked = false;
  const steps: AiChatAction[] = [];
  for (const action of candidates) {
    if (seen.has(action.label)) continue;
    if (action.kind === 'ask' && already.has(action.prompt)) continue;
    if (action.kind === 'link') {
      if (linked) continue;
      linked = true;
    }
    seen.add(action.label);
    steps.push(action);
  }

  return steps.slice(0, MAX_NEXT_STEPS);
}

/** The opening chips on an empty conversation — the four questions people actually ask first. */
export const AI_STARTERS: { label: string; prompt: string; icon: string }[] = [
  {
    label: 'Сургууль сонгох',
    prompt: 'Сөүлд хэлний бэлтгэлтэй ямар сургуулиуд байдаг вэ?',
    icon: 'building-2',
  },
  {
    label: 'GKS тэтгэлэг',
    prompt: 'GKS тэтгэлэгт хэрхэн хамрагдах вэ?',
    icon: 'award',
  },
  {
    label: 'Элсэлтийн хугацаа',
    prompt: 'Ойрын элсэлтүүдийн бүртгэл хэзээ хаагдах вэ?',
    icon: 'calendar-clock',
  },
  {
    label: 'Үнэ, төлбөр',
    prompt: 'Танай зуучлалын үйлчилгээний үнэ хэд вэ?',
    icon: 'receipt',
  },
];

/* ── History ─────────────────────────────────────────────────────────────── */

export interface AiChatHistoryGroup {
  label: string;
  items: AiChatSessionSummary[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today / yesterday / this week / this month / earlier — the buckets every chat
 * product converged on, and the ones people complain about when they go.
 *
 * Days are the viewer's local days: "yesterday" is about when the person was
 * talking, not about UTC.
 */
export function groupChatHistory(items: AiChatSessionSummary[], now: Date = new Date()): AiChatHistoryGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets: AiChatHistoryGroup[] = [
    { label: 'Өнөөдөр', items: [] },
    { label: 'Өчигдөр', items: [] },
    { label: 'Сүүлийн 7 хоног', items: [] },
    { label: 'Сүүлийн 30 хоног', items: [] },
    { label: 'Өмнө нь', items: [] },
  ];

  for (const item of items) {
    const at = new Date(item.lastMessageAt).getTime();
    const index =
      at >= startOfToday
        ? 0
        : at >= startOfToday - DAY_MS
          ? 1
          : at >= startOfToday - 6 * DAY_MS
            ? 2
            : at >= startOfToday - 29 * DAY_MS
              ? 3
              : 4;
    buckets[index]!.items.push(item);
  }

  return buckets.filter((bucket) => bucket.items.length > 0);
}

/**
 * The session a guest token names, and when it stops working.
 *
 * `ai_<sessionId base64url>.<expiry ms>.<hmac>` — the server signs it and is
 * the only judge of it; the browser reads the two plain fields so it can find
 * the token for a conversation and drop the ones that have expired, nothing
 * more.
 */
export function parseChatToken(token: string): { sessionId: string; expiresAt: number } | null {
  if (!token.startsWith('ai_')) return null;
  const [idB64, expiresRaw] = token.slice(3).split('.');
  if (!idB64 || !expiresRaw) return null;

  try {
    const base64 = idB64.replace(/-/g, '+').replace(/_/g, '/');
    const sessionId = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const expiresAt = Number.parseInt(expiresRaw, 10);
    return sessionId && Number.isFinite(expiresAt) ? { sessionId, expiresAt } : null;
  } catch {
    return null;
  }
}
