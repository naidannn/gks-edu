import {
  AccreditationGrade,
  DocStage,
  GuarantorRelation,
  GuarantorType,
  Necessity,
  type Prisma,
} from '../../src/generated/prisma/client.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1F-12 — the visa-stage requirement base, transcribed from the office's list
// "Визэнд орохтой холбоотой бэлдэх шаардлагатай бичиг баримт" (2026-11-21).
//
// The list has two halves, and the school's accreditation tier picks between
// them: an accredited school's students (EXCELLENT or CERTIFIED — simplified
// D-2/D-4 screening) bring only the common papers; a non-accredited (`NONE`)
// school's students also bring a guarantor's papers, one branch per sponsor
// situation. Shared by `seed.ts` and `import-visa-requirements.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateSeed = Omit<Prisma.DocumentTemplateCreateInput, 'rules' | 'caseDocuments'>;

/** `[templateCode, rule]` — the rule's `templateId` is filled in after upsert. */
export type RuleSeed = [string, Omit<Prisma.RequirementRuleUncheckedCreateInput, 'templateId'>];

const E_MONGOLIA = 'E-Mongolia-аас';

/**
 * Templates the visa list introduces. The rules below also name admission
 * templates (PASSPORT, BIRTH_CERT_REF_EN, EMPLOYER_REF …), which `seed.ts`
 * owns — the importer refuses to run if one of those is missing.
 */
export const VISA_DOCUMENT_TEMPLATES: TemplateSeed[] = [
  // ── Everyone.
  {
    code: 'VISA_FORM',
    nameMn: 'Визний анкет',
    descriptionMn: 'БНСУ-ын Элчин сайдын яамны маягтын дагуу бөглөнө.',
    tipsMn: 'Анкетыг ажилтан хамт бөглөж, шалгаж өгнө.',
  },
  {
    code: 'VISA_PHOTO',
    nameMn: 'Цээж зураг (3.5 × 4.5 см)',
    descriptionMn: 'Сүүлийн 6 сард авахуулсан, цагаан дэвсгэртэй, 1 хувь.',
    needsPhysicalOriginal: true,
  },
  {
    code: 'ADMISSION_LETTER',
    nameMn: 'Сургуулийн элсэлтийн батламж / урилга',
    issuerHint: 'Элсэх сургууль',
  },
  {
    code: 'MARITAL_STATUS_REF_EN',
    nameMn: 'Гэрлэлтийн байгаа эсэх лавлагаа (англи хэлээр)',
    sourceHint: E_MONGOLIA,
  },
  {
    code: 'POLICE_REF_EN',
    nameMn: 'Цагдаагийн газрын тодорхойлолт (англи хэлээр)',
    sourceHint: E_MONGOLIA,
  },
  {
    code: 'CHILD_BIRTH_CERT_REF_EN',
    nameMn: 'Хүүхдийн төрсний бүртгэлийн лавлагаа (англи хэлээр)',
    sourceHint: E_MONGOLIA,
  },
  {
    code: 'VISA_FEE_RECEIPT',
    nameMn: 'Виз мэдүүлгийн төвийн хураамжийн баримт',
    descriptionMn: 'Тухайн төвөөс хамааран 33,000–50,000₮.',
  },
  {
    code: 'KVAC_FEE_RECEIPT',
    nameMn: 'KVAC-ийн хураамжийн баримт',
    descriptionMn: '57,000₮.',
  },
  {
    code: 'VISA_LONG_STAY_FEE_RECEIPT',
    nameMn: '90-ээс дээш хоногийн визний хураамжийн баримт',
    descriptionMn: '60 ам.доллар.',
  },

  // ── Non-accredited school: a guarantor whose parents pay social insurance.
  {
    code: 'GUARANTOR_LETTER',
    nameMn: 'Батлан даагчийн гар өргөдөл',
    descriptionMn: 'Батлан даагч өөрийн гараар бичиж, гарын үсэг зурна.',
  },

  // ── Non-accredited school: parents without social insurance.
  {
    code: 'BANK_STATEMENT_DETAILED_3M',
    nameMn: 'Сүүлийн 3 сарын дэлгэрэнгүй дансны хуулга',
    descriptionMn: 'Эцэг, эх хоёрын цалингийн нийлбэр 2.5 саяас дээш байх шаардлагатай.',
    issuerHint: 'Арилжааны банк',
  },
  {
    code: 'BANK_STATEMENT_SUMMARY_6M',
    nameMn: 'Сүүлийн 6 сарын хураангуй дансны хуулга',
    issuerHint: 'Арилжааны банк',
  },
  {
    code: 'CO_SPONSOR_ID_REF_EN',
    nameMn: 'Нэмэлт батлан даагчийн (авга, нагац) иргэний үнэмлэхийн англи лавлагаа',
    sourceHint: E_MONGOLIA,
  },

  // ── Non-accredited school: no sponsor meets any branch.
  {
    code: 'APPLICANT_LETTER',
    nameMn: 'Гар өргөдөл',
    descriptionMn: 'Батлан даагчийн аль ч нөхцөлийг хангахгүй тохиолдолд бичиж өгнө.',
  },

  // ── Non-accredited school: every guarantor branch.
  {
    code: 'SELF_INTRO_FORM',
    nameMn: 'Албан ёсны өөрийн танилцуулгын маягт (монгол, солонгос хэлээр)',
  },
  {
    code: 'BANK_BALANCE_CERT',
    nameMn: 'Дансны тодорхойлолт (мөнгө байршуулсан данс)',
    descriptionMn:
      'Мөнгө дансанд дор хаяж 1 сар байршсан байх. Шаардагдах дүн сургуулиас хамаарна.',
    issuerHint: 'Арилжааны банк',
    validityDays: 30,
  },
  {
    code: 'BANK_STATEMENT_1M',
    nameMn: '1 сарын дансны хуулга (мөнгө байршуулсан данс)',
    issuerHint: 'Арилжааны банк',
  },

  // Left without a universal rule by the office's list; kept so staff can still
  // add one to a case by hand (1D-22) or attach it to one school (1D-18).
  {
    code: 'TUITION_RECEIPT',
    nameMn: 'Сургалтын төлбөр төлсөн баримт',
    descriptionMn: 'Банкны шилжүүлгийн баримт, сургуулийн баталгаажуулалттай.',
  },
  {
    code: 'FAMILY_REF_EN',
    nameMn: 'Гэр бүлийн лавлагаа (англи хэлээр)',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'TB_TEST',
    nameMn: 'Сүрьеэгийн шинжилгээний бичиг',
    descriptionMn: 'БНСУ-ын Элчин сайдын яамнаас зөвшөөрсөн эмнэлгээс авна.',
    needsPhysicalOriginal: true,
  },
];

export function visaRules(): RuleSeed[] {
  const rules: RuleSeed[] = [];
  let order = 0;
  const add = (
    code: string,
    rule: Partial<Omit<Prisma.RequirementRuleUncheckedCreateInput, 'templateId'>> = {},
  ) => {
    rules.push([
      code,
      { stage: DocStage.VISA, necessity: Necessity.REQUIRED, sortOrder: (order += 10), ...rule },
    ]);
  };
  // Every guarantor paper is asked of a non-accredited school's students only.
  const guarantor = (
    code: string,
    rule: Partial<Omit<Prisma.RequirementRuleUncheckedCreateInput, 'templateId'>> = {},
  ) => add(code, { accreditationGrades: [AccreditationGrade.NONE], ...rule });

  // 1. Everyone, whatever the school.
  add('PASSPORT');
  add('ADMISSION_LETTER');
  add('VISA_FORM');
  add('VISA_PHOTO');
  add('BIRTH_CERT_REF_EN');
  add('MARITAL_STATUS_REF_EN');
  add('POLICE_REF_EN');
  add('CHILD_BIRTH_CERT_REF_EN', {
    necessity: Necessity.CONDITIONAL,
    conditionNote: 'Хүүхэдтэй бол',
  });
  // Paid at the counter on the day, so they must not hold up "ready to submit".
  add('VISA_FEE_RECEIPT', {
    necessity: Necessity.CONDITIONAL,
    conditionNote: 'Виз мэдүүлэх үед төлнө',
  });
  add('KVAC_FEE_RECEIPT', {
    necessity: Necessity.CONDITIONAL,
    conditionNote: 'Виз мэдүүлэх үед төлнө',
  });
  add('VISA_LONG_STAY_FEE_RECEIPT', {
    necessity: Necessity.CONDITIONAL,
    conditionNote: '90-ээс дээш хоног зорчих бол, виз мэдүүлэх үед төлнө',
  });

  // 2a. Parents pay social insurance.
  const insured = [GuarantorType.EMPLOYEE];
  guarantor('PARENT_ID_REF_EN', { guarantorTypes: insured });
  guarantor('GUARANTOR_LETTER', { guarantorTypes: insured });
  guarantor('EMPLOYER_REF', { guarantorTypes: insured });
  guarantor('SOCIAL_INSURANCE_REF_EN', { guarantorTypes: insured });

  // A sponsor who is not a parent proves kinship. Listed before the co-sponsor
  // rows below so that, when both match, this required one wins the dedupe.
  guarantor('KINSHIP_REF', {
    guarantorRelations: [
      GuarantorRelation.SIBLING,
      GuarantorRelation.UNCLE_AUNT,
      GuarantorRelation.OTHER,
    ],
  });

  // 2b. Parents without social insurance — income shown from bank statements.
  const uninsured = [GuarantorType.NO_SOCIAL_INSURANCE];
  guarantor('BANK_STATEMENT_DETAILED_3M', { guarantorTypes: uninsured });
  guarantor('BANK_STATEMENT_SUMMARY_6M', { guarantorTypes: uninsured });

  // 2c. Self-employed parents (a company director files the same papers).
  const business = [GuarantorType.SELF_EMPLOYED, GuarantorType.COMPANY_DIRECTOR];
  guarantor('LEASE_CONTRACT', { guarantorTypes: business });
  guarantor('COMPANY_REF', { guarantorTypes: business });
  guarantor('TAX_REF_EN', { guarantorTypes: business });

  // An insured uncle or aunt joins as a second sponsor: always for a business,
  // and for uninsured parents only when their salaries fall short. They file
  // the insured branch's papers, with the kinship reference in place of the
  // birth record.
  const coSponsor = 'Авга, нагацынх (нийгмийн даатгалтай)';
  const shortfall = 'Цалингийн нийлбэр 2.5 саяд хүрэхгүй бол — авга, нагацынх';
  for (const [types, necessity, conditionNote] of [
    [business, Necessity.REQUIRED, coSponsor],
    [uninsured, Necessity.CONDITIONAL, shortfall],
  ] as const) {
    for (const code of [
      'CO_SPONSOR_ID_REF_EN',
      'KINSHIP_REF',
      'GUARANTOR_LETTER',
      'EMPLOYER_REF',
      'SOCIAL_INSURANCE_REF_EN',
    ]) {
      guarantor(code, { guarantorTypes: [...types], necessity, conditionNote });
    }
  }

  // 2d. No sponsor meets any branch.
  guarantor('APPLICANT_LETTER', { guarantorTypes: [GuarantorType.NONE] });

  // 2e. Every guarantor branch.
  guarantor('SELF_INTRO_FORM');
  guarantor('BANK_BALANCE_CERT');
  guarantor('BANK_STATEMENT_1M');

  return rules;
}
