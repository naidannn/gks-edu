import type {
  Question,
  QuestionnaireAnswers,
  QuestionnaireDefinition,
  QuestionnaireLevel,
  QuestionnaireProgress,
  QuestionSection,
} from '@gks/shared';

/**
 * The portal's half of the questionnaire logic (1D-27). The API owns the
 * question sets and re-checks everything on save; this mirrors the few rules
 * the form needs while the client is typing — which questions are asked, and
 * how far along a section is — from
 * `apps/api/src/modules/questionnaires/definitions/index.ts`.
 */

export function isAnswered(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isVisible(question: Question, answers: QuestionnaireAnswers): boolean {
  return !question.showIf || answers[question.showIf.id] === question.showIf.equals;
}

export function visibleQuestions(section: QuestionSection, answers: QuestionnaireAnswers): Question[] {
  return section.questions.filter((question) => isVisible(question, answers));
}

/** One screen of the form, with the part it belongs to. */
export interface QuestionnaireStep {
  key: string;
  partTitle: string;
  partTitleEn?: string;
  partRequirement?: string;
  /** True for the first section of a part — where the part's requirement is shown. */
  opensPart: boolean;
  section: QuestionSection;
}

export function questionnaireSteps(definition: QuestionnaireDefinition): QuestionnaireStep[] {
  return definition.parts.flatMap((part) =>
    part.sections.map((section, index) => ({
      key: `${part.id}.${section.id}`,
      partTitle: part.title,
      partTitleEn: part.titleEn,
      partRequirement: part.requirement,
      opensPart: index === 0,
      section,
    })),
  );
}

export function sectionProgress(section: QuestionSection, answers: QuestionnaireAnswers): QuestionnaireProgress {
  const asked = visibleQuestions(section, answers);
  return {
    answered: asked.filter((question) => isAnswered(answers[question.id])).length,
    total: asked.length,
    missingRequired: asked.filter((q) => q.required && !isAnswered(answers[q.id])).map((q) => q.id),
  };
}

export function questionnaireProgress(
  definition: QuestionnaireDefinition,
  answers: QuestionnaireAnswers,
): QuestionnaireProgress {
  const sections = definition.parts.flatMap((part) => part.sections);
  return sections.reduce<QuestionnaireProgress>(
    (sum, section) => {
      const one = sectionProgress(section, answers);
      return {
        answered: sum.answered + one.answered,
        total: sum.total + one.total,
        missingRequired: [...sum.missingRequired, ...one.missingRequired],
      };
    },
    { answered: 0, total: 0, missingRequired: [] },
  );
}

/** Minutes left, from each unfinished section's estimate — "~25 мин үлдлээ". */
export function minutesLeft(definition: QuestionnaireDefinition, answers: QuestionnaireAnswers): number {
  return definition.parts
    .flatMap((part) => part.sections)
    .reduce((sum, section) => {
      const { answered, total } = sectionProgress(section, answers);
      if (!total || answered >= total) return sum;
      return sum + Math.ceil((section.minutes ?? 3) * (1 - answered / total));
    }, 0);
}

/**
 * What changed since the last save — the autosave sends only this. A cleared
 * answer goes out as `''`, which is how the API knows to erase it.
 */
export function answersPatch(saved: QuestionnaireAnswers, current: QuestionnaireAnswers): QuestionnaireAnswers {
  const patch: QuestionnaireAnswers = {};
  for (const [id, value] of Object.entries(current)) {
    if ((saved[id] ?? '') !== value) patch[id] = value;
  }
  for (const id of Object.keys(saved)) {
    if (!(id in current)) patch[id] = '';
  }
  return patch;
}

/** The teacher's link, on whatever host the client is looking at. */
export function recommendationLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/recommend/${token}`;
}

/**
 * A message the client can paste into Messenger as it is. Teachers in Mongolia
 * are asked by their students, in their students' words — so the text is the
 * student's voice, polite, and says the three things a busy teacher checks:
 * what it is for, that Mongolian is fine, and how long it takes.
 */
export function teacherMessage(input: {
  applicantName: string;
  teacherName: string;
  level: QuestionnaireLevel;
  link: string;
}): string {
  const level = { BACHELOR: 'бакалаврын', MASTER: 'магистрын', PHD: 'докторын' }[input.level];
  const greeting = input.teacherName.trim() ? `Сайн байна уу, ${input.teacherName.trim()}.` : 'Сайн байна уу, багшаа.';
  return [
    greeting,
    `Би ${input.applicantName} байна. БНСУ-ын Засгийн газрын тэтгэлэг (GKS)-ийн ${level} хөтөлбөрт материал бүрдүүлж байгаа бөгөөд танаас тодорхойлолт хүсэх гэсэн юм.`,
    `Доорх холбоосоор орж хэдэн асуултад монголоор хариулж өгөөч. Ойролцоогоор 15–20 минут болно, нэвтрэх шаардлагагүй. Таны хариултаар GKS EDU төв англи хувилбарыг бэлтгээд, би танд гарын үсэг зуруулахаар авчирна.`,
    input.link,
    'Их баярлалаа!',
  ].join('\n\n');
}
