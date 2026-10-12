import { describe, expect, it, vi } from 'vitest';
import { AccessLevel, EducationLevel, ProgramLevel } from '../../../../prisma/client.js';
import type { StudyPlanService } from '../../../study-plan/study-plan.service.js';
import { findInventedAmounts } from '../guard.service.js';
import { sayMnt, StudyPlanTools } from './study-plan.tools.js';
import type { ToolContext } from './tool.types.js';

/** ₩1 = 2.5₮ keeps the arithmetic in the assertions readable. */
const RATE = 2.5;

const program = (slug: string, nameMn: string, tuitionPerTermKrw: number) => ({
  id: `${slug}-${nameMn}`,
  level: ProgramLevel.BACHELOR,
  nameMn,
  tuitionPerTermKrw,
  tuitionPerYearKrw: null,
  topikLevel: 3,
  university: { slug, nameMn: `${slug} их сургууль`, cityMn: 'Сөүл', regionMn: 'Сөүл', logoPath: null },
});

/** The shape `StudyPlanService.build` returns, cut down to what the tool reads. */
function fakePlan(input: Record<string, unknown>) {
  return {
    input: { field: null, region: null, budgetKrw: null, ...input },
    stages: [
      {
        titleMn: 'Хэлний бэлтгэл',
        durationMonths: 9,
        reasonMn: 'TOPIK 3 хэрэгтэй',
        start: { year: 2027, month: 3, registerBy: '2026-12-01T14:59:59.000Z', daysToRegister: 49, source: 'REAL' },
      },
      {
        titleMn: 'Бакалавр',
        durationMonths: null,
        reasonMn: 'TOPIK 3 авсны дараа',
        start: { year: 2027, month: 9, registerBy: null, daysToRegister: null, source: 'ESTIMATED' },
      },
    ],
    schools: {
      gate: 'AFTER_PREP',
      total: 42,
      // Two departments of the same school must not take two of the three places.
      items: [
        program('alpha', 'Бизнес', 3_000_000),
        program('alpha', 'Маркетинг', 3_100_000),
        program('beta', 'IT', 4_000_000),
        program('gamma', 'Дизайн', 2_000_000),
        program('delta', 'Хууль', 5_000_000),
      ],
      regions: [{ value: 'Seoul', label: 'Сөүл', count: 30 }],
    },
    cost: {
      krwToMnt: RATE,
      fxDate: '2026-10-13T00:00:00.000Z',
      items: [
        { key: 'SERVICE_FEE', labelMn: 'Үйлчилгээ', noteMn: null, minKrw: null, maxKrw: null, minMnt: 1_200_000, maxMnt: 1_200_000, isEstimate: false },
        { key: 'TUITION', labelMn: 'Сургалт', noteMn: null, minKrw: 6_000_000, maxKrw: 8_000_000, minMnt: 15_000_000, maxMnt: 20_000_000, isEstimate: false },
        { key: 'ADMISSION_FEE', labelMn: 'Элсэлт', noteMn: null, minKrw: null, maxKrw: null, minMnt: null, maxMnt: null, isEstimate: false },
      ],
      totalMinMnt: 16_200_000,
      totalMaxMnt: 21_200_000,
      nextStage: { titleMn: 'Бакалавр', minKrw: 4_000_000, maxKrw: 10_000_000 },
    },
  };
}

function planTool() {
  const build = vi.fn(async (query: Record<string, unknown>, _options?: unknown) => fakePlan({ ...query }));
  const tools = new StudyPlanTools({ build } as unknown as StudyPlanService);
  const tool = tools.tools()[0]!;
  const run = (args: Record<string, unknown>) =>
    tool.run(args, { level: AccessLevel.PUBLIC } as unknown as ToolContext);
  return { tool, run, build };
}

describe('build_study_plan', () => {
  it('is open to a guest and needs nothing but the goal', () => {
    const { tool } = planTool();

    expect(tool.minLevel).toBe(AccessLevel.PUBLIC);
    expect(tool.parameters.required).toEqual(['goal']);
  });

  it('fills in what nobody asked: the diploma from the goal, and no Korean', async () => {
    const { run, build } = planTool();
    await run({ goal: 'BACHELOR' });

    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]![0]).toMatchObject({
      goal: ProgramLevel.BACHELOR,
      education: EducationLevel.SECONDARY_SCHOOL,
      topik: 0,
    });
    // Three schools, one programme each — not the top school's first six departments.
    expect(build.mock.calls[0]![1]).toEqual({ schoolsShown: 3 });
  });

  it('names three different schools, not one school twice', async () => {
    const { run } = planTool();
    const { data } = await run({ goal: 'BACHELOR' });
    const schools = (data as { сургуулиуд: { сургууль: string }[] }).сургуулиуд;

    expect(schools.map((row) => row.сургууль)).toEqual(['alpha их сургууль', 'beta их сургууль', 'gamma их сургууль']);
  });

  it('turns a budget said in tögrög into the planner’s won ceiling', async () => {
    const { run, build } = planTool();
    await run({ goal: 'BACHELOR', maxTuitionPerYearMnt: 20_000_000 });

    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[1]![0]).toMatchObject({ budget: 8_000_000 });
  });

  it('picks the ceiling itself for "something cheaper", instead of letting the model invent one', async () => {
    const { run, build } = planTool();
    await run({ goal: 'BACHELOR', cheaper: true });

    // The lower choice, 15 сая₮, at ₩1 = 2.5₮.
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[1]![0]).toMatchObject({ budget: 6_000_000 });
  });

  it('keeps offering the budget choices after one was applied', async () => {
    const { run } = planTool();
    const { data } = await run({ goal: 'BACHELOR', maxTuitionPerYearMnt: 15_000_000 });

    expect((data as { төсвийн_сонголт: string[] }).төсвийн_сонголт).toEqual(['15 сая₮ хүртэл', '20 сая₮ хүртэл']);
  });

  it('offers budget choices from the degree’s own price range', async () => {
    const { run } = planTool();
    const { data } = await run({ goal: 'BACHELOR' });

    // ₩4m–₩10m a year at 2.5 → 10–25 сая₮; a third and two thirds of the way.
    expect((data as { төсвийн_сонголт: string[] }).төсвийн_сонголт).toEqual(['15 сая₮ хүртэл', '20 сая₮ хүртэл']);
  });

  // The point of writing the figures here: the guard drops any ₮ amount it
  // cannot find in a source, so what the model copies must survive it.
  it('writes tögrög the way the guard reads it back', async () => {
    const { run } = planTool();
    const outcome = await run({ goal: 'BACHELOR' });
    const source = JSON.stringify(outcome.data);
    const answer =
      'alpha их сургууль — Сөүл, жилд ≈ 15 сая₮ [T1]. Эхний жилийн нийт зардал 16–21 сая₮ [T1]. ' +
      'Үйлчилгээний хураамж 1.2 сая₮ [T1].';

    expect(findInventedAmounts(answer, [source])).toEqual([]);
    expect(findInventedAmounts('Нийт 30 сая₮ болно.', [source])).toEqual(['30 сая₮']);
  });

  it('carries a card the widget can draw, linking to the same plan', async () => {
    const { run } = planTool();
    const { card } = await run({ goal: 'BACHELOR', field: 'IT' });

    expect(card?.type).toBe('study_plan');
    const data = card!.data as { planUrl: string; schools: { tuitionPerYearMnt: number }[]; schoolsAfterPrep: boolean };
    expect(data.planUrl).toContain('/plan?');
    expect(data.planUrl).toContain('goal=BACHELOR');
    expect(data.planUrl).toContain('field=IT');
    expect(data.schoolsAfterPrep).toBe(true);
    expect(data.schools[0]!.tuitionPerYearMnt).toBe(15_000_000);
  });
});

describe('sayMnt', () => {
  it.each([
    [24_400_000, '24 сая₮'],
    [6_440_000, '6.4 сая₮'],
    [1_000_000, '1 сая₮'],
    [700_400, '700 мянган₮'],
  ])('%d → %s', (value, said) => {
    expect(sayMnt(value)).toBe(said);
  });
});
