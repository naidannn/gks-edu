import type { ProfileQuestionnaireDefinition, QuestionSection } from './types.js';

/**
 * «Нэмэлт мэдээллийн асуулга» (1B-29) — what the office needs about a client
 * once they have signed on, and the registration form does not ask: the high
 * school a school-leaver comes from, what the family does and earns, and
 * whether they want a dormitory bed.
 *
 * The school's application form and the visa file are written from these, so
 * the questions are phrased the way those forms ask. Ids are a contract with
 * stored answers — rename a label freely, never an id.
 */

const HIGH_SCHOOL: QuestionSection = {
  id: 'high-school',
  title: 'Ахлах сургууль',
  purpose: 'Сургуулийн мэдүүлэгт бичигдэнэ. Солонгосын сургууль таны төгсөлтийг энэ сургуулиас шалгаж болно.',
  minutes: 2,
  questions: [
    {
      id: 'hs_name',
      label: 'Төгссөн (эсвэл суралцаж буй) ахлах сургуулийн нэр',
      placeholder: 'Нийслэлийн 1-р сургууль',
      kind: 'short',
      required: true,
    },
    {
      id: 'hs_address',
      label: 'Сургуулийн хаяг',
      placeholder: 'Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо, …',
      kind: 'short',
      required: true,
    },
    {
      id: 'hs_phone',
      label: 'Сургуулийн утас',
      hint: 'Захиргаа эсвэл сургалтын албаны дугаар.',
      placeholder: '7011-2233',
      kind: 'short',
      required: true,
    },
    {
      id: 'hs_email',
      label: 'Сургуулийн и-мэйл',
      hint: 'Сургууль и-мэйлгүй бол хоосон үлдээнэ.',
      placeholder: 'school1@edu.mn',
      kind: 'short',
    },
  ],
};

const FAMILY: QuestionSection = {
  id: 'family',
  title: 'Аав, ээжийн ажил ба орлого',
  purpose: 'Визний материалд гэр бүлийн санхүүгийн чадварыг харуулахад хэрэгтэй.',
  note: 'Бодит мэдээллээ бичнэ үү. Энд бичсэн орлого цалингийн тодорхойлолт, банкны хуулгатай зөрвөл визэнд татгалзах эрсдэлтэй.',
  minutes: 2,
  questions: [
    {
      id: 'father_occupation',
      group: 'Аав',
      label: 'Ажлын газар, албан тушаал',
      hint: 'Хувиараа эрхэлдэг, тэтгэвэрт гарсан, ажилгүй бол тэгж бичнэ.',
      placeholder: '«Монгол барилга» ХХК, инженер',
      kind: 'short',
    },
    { id: 'father_income', group: 'Аав', label: 'Сарын орлого (₮)', placeholder: '2,500,000', kind: 'short' },
    {
      id: 'mother_occupation',
      group: 'Ээж',
      label: 'Ажлын газар, албан тушаал',
      placeholder: 'Сүхбаатар дүүргийн 5-р цэцэрлэг, багш',
      kind: 'short',
    },
    { id: 'mother_income', group: 'Ээж', label: 'Сарын орлого (₮)', placeholder: '1,800,000', kind: 'short' },
  ],
};

const SPONSOR: QuestionSection = {
  id: 'sponsor',
  title: 'Санхүүгийн батлан даагч',
  purpose: 'Сургалтын төлбөр, амьжиргааны зардлыг хэн даахыг сургууль ба элчин сайдын яам асууна.',
  minutes: 1,
  questions: [
    {
      id: 'sponsor_other',
      label: 'Таны сургалтын зардлыг аав, ээжээс өөр хүн даах уу?',
      hint: 'Жишээ нь ах, эгч, авга. Аав, ээж тань даах бол «Үгүй».',
      kind: 'yesno',
      required: true,
    },
    { id: 'sponsor_name', label: 'Батлан даагчийн овог нэр', kind: 'short', showIf: { id: 'sponsor_other', equals: 'yes' } },
    {
      id: 'sponsor_relation',
      label: 'Таны юу болох',
      placeholder: 'Авга ах',
      kind: 'short',
      showIf: { id: 'sponsor_other', equals: 'yes' },
    },
    { id: 'sponsor_phone', label: 'Утас', placeholder: '99112233', kind: 'short', showIf: { id: 'sponsor_other', equals: 'yes' } },
    {
      id: 'sponsor_occupation',
      label: 'Ажлын газар, албан тушаал',
      kind: 'short',
      showIf: { id: 'sponsor_other', equals: 'yes' },
    },
    {
      id: 'sponsor_income',
      label: 'Сарын орлого (₮)',
      placeholder: '3,000,000',
      kind: 'short',
      showIf: { id: 'sponsor_other', equals: 'yes' },
    },
  ],
};

const DORMITORY: QuestionSection = {
  id: 'dormitory',
  title: 'Дотуур байр',
  purpose: 'Дотуур байрны хүсэлтийг сургуульд мэдүүлэгтэй хамт өгдөг — орон тоо хязгаартай.',
  minutes: 1,
  questions: [
    { id: 'dorm', label: 'Сургуулийн дотуур байранд амьдрах уу?', kind: 'yesno', required: true },
    {
      id: 'dorm_note',
      label: 'Өрөөний хүсэлт',
      hint: 'Сургуулийн боломжоос хамаарна — баталгаа биш.',
      placeholder: '2 хүний өрөө',
      kind: 'short',
      showIf: { id: 'dorm', equals: 'yes' },
    },
    {
      id: 'housing_plan',
      label: 'Хаана амьдрах вэ?',
      placeholder: 'Сөүлд амьдардаг ахындаа',
      kind: 'short',
      showIf: { id: 'dorm', equals: 'no' },
    },
  ],
};

/**
 * The high school matters to whoever applies on a school-leaving certificate:
 * language prep and a bachelor's, and a GKS applicant who has not studied past
 * school (their scholarship is a bachelor's one).
 */
export function asksHighSchool(input: { serviceTypes: readonly string[]; educationLevel?: string | null }): boolean {
  if (input.serviceTypes.some((type) => type === 'LANGUAGE_PREP' || type === 'BACHELOR')) return true;
  return (
    input.serviceTypes.includes('GKS_SCHOLARSHIP') &&
    (input.educationLevel === 'SECONDARY_SCHOOL' || input.educationLevel === 'VOCATIONAL')
  );
}

export function profileDefinition(options: { asksHighSchool: boolean }): ProfileQuestionnaireDefinition {
  return {
    kind: 'PROFILE',
    title: 'Нэмэлт мэдээллийн асуулга',
    intro: [
      'Сургуулийн мэдүүлэг ба визний материалыг бэлтгэхэд хэрэгтэй хэдэн мэдээлэл асууя.',
      'Бичсэн бүхэн автоматаар хадгалагдана — хэд хэдэн удаа орж бөглөж болно.',
    ],
    parts: [
      {
        id: 'profile',
        title: 'Нэмэлт мэдээлэл',
        sections: [...(options.asksHighSchool ? [HIGH_SCHOOL] : []), FAMILY, SPONSOR, DORMITORY],
      },
    ],
  };
}

/**
 * Every question any client may be asked. Answers are cleaned against this, not
 * the tailored set, so a service changed from bachelor to master does not wipe
 * the high school the client already typed.
 */
export const PROFILE_QUESTIONS = profileDefinition({ asksHighSchool: true });
