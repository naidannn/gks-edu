import { Injectable, Logger } from '@nestjs/common';
import {
  AccessLevel,
  EducationLevel,
  LeadSource,
  ChatOutcome,
  ServiceType,
} from '../../../../prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LeadsService } from '../../../leads/leads.service.js';
import type { CreatePublicLeadDto } from '../../../leads/dto/create-public-lead.dto.js';
import { readEnum, readNumber, readString, requireString } from './args.js';
import type { AiTool, AiToolProvider, ToolContext, ToolOutcome } from './tool.types.js';

const EDUCATION_LEVELS = Object.values(EducationLevel);
const SERVICE_TYPES = Object.values(ServiceType);
const TIMING = ['WITHIN_3_MONTHS', 'THIS_YEAR', 'NEXT_YEAR', 'UNDECIDED'] as const;
const BUDGET = ['UNDER_10M', 'UPTO_20M', 'OVER_20M', 'UNSURE'] as const;

/** What the assistant has learned about a visitor, as `ChatSession.profile`. */
export interface VisitorProfile {
  educationLevel?: EducationLevel;
  gpa?: number;
  gpaScale?: string;
  koreanLevel?: string;
  goalLevel?: ServiceType;
  budget?: (typeof BUDGET)[number];
  timing?: (typeof TIMING)[number];
  name?: string;
  phone?: string;
  /** Set when they were asked for a phone number and said no (§6.2). */
  contactDeclined?: boolean;
}

/**
 * The sales loop's two tools (2C-05, 2C-06, `AI-ASSISTANT.md` §6).
 *
 * The principle behind both: **a visitor asks a question and ends up a lead,
 * but through a conversation rather than a form.** Nothing here interrogates
 * anybody. `save_visitor_profile` is the model writing down what was said in
 * passing — "би 11-р анги төгсөнө" is an education level, and asking for it
 * again afterwards is how a chat starts feeling like a form.
 *
 * `create_consultation_request` is the only tool in the system that **writes**,
 * and it is deliberately narrow: it takes a name and a phone number the visitor
 * volunteered and hands them to `LeadsService.createFromPublicForm`, the same
 * path the website's own form uses. That is what makes the dedupe window, the
 * Meta conversion, the Slack line and the acknowledgement email apply to a
 * chat-born lead without a second copy of any of it (§6.3).
 *
 * Two rules it must not break:
 *
 * - **A phone number is never invented and never inferred.** The tool takes one
 *   the visitor typed. The model is told, in the description, that calling this
 *   without one is not allowed — and `requireString` enforces it, because a
 *   description is a request and a throw is a rule.
 * - **Somebody who already holds a contract is not a new lead.** They are a
 *   client asking a question, and filing that as a fresh enquiry puts a
 *   consultant on the phone to somebody they are already working with. The
 *   conversation is recorded against the account instead.
 */
@Injectable()
export class LeadTools implements AiToolProvider {
  private readonly logger = new Logger(LeadTools.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
  ) {}

  tools(): AiTool[] {
    return [this.saveVisitorProfile(), this.createConsultationRequest()];
  }

  // ─── 2C-05 ──────────────────────────────────────────────────────────────────

  private saveVisitorProfile(): AiTool {
    return {
      name: 'save_visitor_profile',
      minLevel: AccessLevel.PUBLIC,
      label: 'Тэмдэглэж байна…',
      description:
        'Хэрэглэгчийн ярианд дурдсан мэдээллийг тэмдэглэнэ: боловсролын түвшин, дүн, солонгос ' +
        'хэлний түвшин, зорьж буй түвшин, төсөв, хугацаа, нэр. Хэрэглэгч өөрөө хэлсэн утгыг л ' +
        'бич — таамаглаж болохгүй. Нэг дуудлагаар мэдсэн бүх талбараа дамжуул. Дахин асуухаас ' +
        'сэргийлж мэдсэн даруйдаа дууд.',
      parameters: {
        type: 'object',
        properties: {
          educationLevel: { type: 'string', enum: EDUCATION_LEVELS, description: 'Одоогийн/төгссөн боловсрол' },
          gpa: { type: 'number', description: 'Голч дүн, хэлсэн хэмжүүрээр' },
          gpaScale: { type: 'string', description: 'Голчийн хэмжүүр: 4.0, 100, …' },
          koreanLevel: { type: 'string', description: 'TOPIK 3, анхан шат, мэдэхгүй гэх мэт' },
          goalLevel: { type: 'string', enum: SERVICE_TYPES, description: 'Зорьж буй үйлчилгээ' },
          budget: { type: 'string', enum: [...BUDGET] },
          timing: { type: 'string', enum: [...TIMING] },
          name: { type: 'string', description: 'Хэрэглэгчийн нэр, өөрөө танилцуулсан бол' },
          contactDeclined: {
            type: 'boolean',
            description: 'Утсаа өгөхөөс татгалзсан бол true. Үүний дараа дахин бүү асуу.',
          },
        },
      },
      run: async (args, context): Promise<ToolOutcome> => {
        const patch: VisitorProfile = {};

        const educationLevel = readEnum(args, 'educationLevel', EDUCATION_LEVELS);
        if (educationLevel) patch.educationLevel = educationLevel;

        // Decimal, not integer: a grade is 3.8 as often as it is 85, and
        // truncating it turns a good student into an average one silently. The
        // ceiling covers both scales the office sees, 4.0 and 100.
        const gpa = readNumber(args, 'gpa', 0, 100);
        if (gpa !== undefined) patch.gpa = gpa;

        const gpaScale = readString(args, 'gpaScale', 20);
        if (gpaScale) patch.gpaScale = gpaScale;

        const koreanLevel = readString(args, 'koreanLevel', 60);
        if (koreanLevel) patch.koreanLevel = koreanLevel;

        const goalLevel = readEnum(args, 'goalLevel', SERVICE_TYPES);
        if (goalLevel) patch.goalLevel = goalLevel;

        const budget = readEnum(args, 'budget', BUDGET);
        if (budget) patch.budget = budget;

        const timing = readEnum(args, 'timing', TIMING);
        if (timing) patch.timing = timing;

        const name = readString(args, 'name', 60);
        if (name) patch.name = name;

        if (args.contactDeclined === true) patch.contactDeclined = true;

        const merged = await this.mergeProfile(context, patch);

        return {
          title: 'Профайл',
          // The whole profile comes back, not the patch: the model's next turn
          // needs to know what it still does not have, and a diff would have it
          // asking again for something it saved two turns ago.
          data: { saved: Object.keys(patch), profile: merged, missing: missingFields(merged) },
        };
      },
    };
  }

  // ─── 2C-06 ──────────────────────────────────────────────────────────────────

  private createConsultationRequest(): AiTool {
    return {
      name: 'create_consultation_request',
      minLevel: AccessLevel.PUBLIC,
      label: 'Зөвлөгөөний хүсэлт үүсгэж байна…',
      description:
        'Зөвлөх залгаж өгөх хүсэлт үүсгэнэ. Зөвхөн хэрэглэгч утасны дугаараа өөрөө бичиж өгсөн, ' +
        'залгуулахыг зөвшөөрсөн тохиолдолд дууд. Дугаарыг хэзээ ч зохиож болохгүй. Хүсэлт ' +
        'үүссэний дараа хэрэглэгчид хэзээ залгахыг хэл.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Хэрэглэгчийн өгсөн 8 оронтой дугаар' },
          name: { type: 'string', description: 'Овог нэр, хэлсэн хэмжээгээр' },
          summary: {
            type: 'string',
            description: 'Яриаг зөвлөхөд зориулж 2–4 өгүүлбэрээр хураангуйл: юу асуусан, юу хэрэгтэй.',
          },
          interestedServices: {
            type: 'array',
            items: { type: 'string', enum: SERVICE_TYPES },
            description: 'Сонирхсон үйлчилгээ',
          },
          universitySlugs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ярианд дурдагдсан сургуулийн slug',
          },
        },
        required: ['phone', 'summary'],
      },
      run: async (args, context): Promise<ToolOutcome> => {
        const phone = requireString(args, 'phone', 20);
        const summary = requireString(args, 'summary', 2_000);
        const name = readString(args, 'name', 120);

        const session = await this.prisma.chatSession.findUniqueOrThrow({
          where: { id: context.session.id },
          select: { profile: true, leadId: true, utm: true },
        });

        // One conversation is one enquiry. Read from the database rather than
        // from `context.session`, which was loaded before this turn began: a
        // model that calls the tool twice inside a single turn would otherwise
        // see a stale null both times and file two leads on one visitor.
        if (session.leadId) {
          return {
            title: 'Хүсэлт аль хэдийн үүссэн',
            data: {
              created: false,
              message:
                'Энэ ярианаас зөвлөгөөний хүсэлт аль хэдийн үүссэн. Дахин үүсгэхгүй — ' +
                'зөвлөх удахгүй холбогдоно гэдгийг л давтан хэл.',
            },
          };
        }

        const profile = (session.profile ?? {}) as VisitorProfile;

        // Already a client: a consultant is working with them, and filing this
        // as a new enquiry would put somebody on the phone to a person they are
        // already looking after. The conversation is filed against the account.
        const existing = context.userId
          ? await this.prisma.client.findFirst({
              where: { userId: context.userId },
              select: { id: true, code: true, leadId: true },
            })
          : null;

        if (existing) {
          if (existing.leadId) {
            await this.prisma.leadActivity.create({
              data: {
                leadId: existing.leadId,
                type: 'CHAT',
                body: summary,
                meta: { channel: 'ai_chat', sessionCode: context.session.code },
              },
            });
          }

          await this.prisma.chatSession.update({
            where: { id: context.session.id },
            data: { outcome: ChatOutcome.HANDOFF, summary },
          });

          return {
            title: 'Аль хэдийн үйлчлүүлэгч',
            data: {
              created: false,
              alreadyClient: true,
              message:
                'Энэ хүн аль хэдийн гэрээтэй үйлчлүүлэгч. Шинэ хүсэлт үүсгэсэнгүй — ' +
                'хариуцсан зөвлөхдөө хандахыг зөвлө, мессенжерийн линкийг өг.',
            },
          };
        }

        const [first, ...rest] = (name ?? profile.name ?? '').trim().split(/\s+/).filter(Boolean);
        const dto = {
          // The form's own DTO wants both halves and the office wants a name to
          // read; one word given is a first name, and "—" is honest about the
          // half nobody said rather than repeating the same word twice.
          lastName: rest.length ? rest.join(' ') : '—',
          firstName: first ?? '—',
          phone,
          note: summary,
          ...(profile.educationLevel ? { educationLevel: profile.educationLevel } : {}),
          ...(profile.gpa !== undefined ? { gpa: profile.gpa } : {}),
          ...(profile.gpaScale ? { gpaScale: profile.gpaScale } : {}),
          ...(profile.koreanLevel ? { koreanLevel: profile.koreanLevel } : {}),
          interestedServices: readServices(args, profile),
          interestedUniversitySlugs: readSlugs(args),
          ...(session.utm ? { utm: session.utm as Record<string, string> } : {}),
        } as unknown as CreatePublicLeadDto;

        const result = await this.leads.createFromPublicForm(dto, {}, {
          source: LeadSource.AI_CHAT,
          userId: context.userId,
        });

        await this.prisma.chatSession.update({
          where: { id: context.session.id },
          data: {
            leadId: result.id,
            outcome: ChatOutcome.LEAD_CREATED,
            summary,
            // The phone goes into the profile too, which is what makes the
            // prompt stop asking for it on the next turn (§6.2) — the capture
            // layer reads `contactSettled` from here, not from the lead.
            profile: { ...profile, phone, ...(name ? { name } : {}) } as object,
          },
        });

        this.logger.log(`${context.session.code} → сэжим ${result.id}${result.merged ? ' (давхардсан)' : ''}`);

        return {
          title: 'Зөвлөгөөний хүсэлт',
          data: {
            created: true,
            // `merged` is the dedupe window: they already asked today. Say so,
            // rather than promising a second call nobody is going to make.
            repeat: result.merged,
            message: result.merged
              ? 'Энэ дугаараар өнөөдөр хүсэлт аль хэдийн бүртгэгдсэн байна. Зөвлөх удахгүй залгана гэдгийг давтан хэл.'
              : 'Хүсэлт бүртгэгдлээ. Ажлын цагт 1 цагийн дотор, бусад үед дараагийн ажлын өдөр залгана гэж хэл.',
          },
        };
      },
    };
  }

  // ─── the profile column ─────────────────────────────────────────────────────

  private async readProfile(context: ToolContext): Promise<VisitorProfile> {
    const row = await this.prisma.chatSession.findUnique({
      where: { id: context.session.id },
      select: { profile: true },
    });

    return (row?.profile ?? {}) as VisitorProfile;
  }

  /**
   * Merges a patch into the stored profile.
   *
   * Read-then-write rather than a JSON merge in SQL, because the shape is the
   * business's and Prisma cannot patch a `Json` column field by field. The race
   * it loses to is two tool calls in the same turn, which the orchestrator runs
   * in sequence — and the cost of losing it is one re-asked question.
   *
   * `contactDeclined` is the one field that only ever goes one way: a visitor
   * who has said no once must not be asked again inside the session, so a later
   * call cannot clear it (§6.2).
   */
  private async mergeProfile(context: ToolContext, patch: VisitorProfile): Promise<VisitorProfile> {
    const current = await this.readProfile(context);
    const merged: VisitorProfile = {
      ...current,
      ...patch,
      ...(current.contactDeclined ? { contactDeclined: true } : {}),
    };

    await this.prisma.chatSession.update({
      where: { id: context.session.id },
      data: { profile: merged as object },
    });

    return merged;
  }
}

/** The six fields §6.2 asks for, minus the ones already known. */
function missingFields(profile: VisitorProfile): string[] {
  const wanted: (keyof VisitorProfile)[] = [
    'educationLevel',
    'gpa',
    'koreanLevel',
    'goalLevel',
    'budget',
    'timing',
  ];

  return wanted.filter((field) => profile[field] === undefined);
}

function readServices(args: Record<string, unknown>, profile: VisitorProfile): ServiceType[] {
  const raw = Array.isArray(args.interestedServices) ? args.interestedServices : [];
  const named = raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => SERVICE_TYPES.find((type) => type.toUpperCase() === value.trim().toUpperCase()))
    .filter((value): value is ServiceType => value !== undefined);

  // What the conversation was about beats what the model listed last; falling
  // back to the stated goal keeps the consultant from opening a blank card.
  const all = named.length ? named : profile.goalLevel ? [profile.goalLevel] : [];
  return [...new Set(all)].slice(0, 5);
}

function readSlugs(args: Record<string, unknown>): string[] {
  const raw = Array.isArray(args.universitySlugs) ? args.universitySlugs : [];
  return raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase().slice(0, 120))
    .filter(Boolean)
    .slice(0, 10);
}
