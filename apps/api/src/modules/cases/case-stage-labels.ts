import { CaseStage } from '../../prisma/client.js';

/**
 * Mongolian names for the stages, for the sentences the API itself has to
 * write — a refused transition, a resume into a stage the case was never at.
 *
 * The frontend keeps its own map (CLAUDE.md), but an error message is composed
 * on this side, and "CONTRACT_DRAFT төлөвөөс BALANCE_PAID руу" is not a
 * sentence anybody in the office reads.
 */
export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  [CaseStage.CONTRACT_DRAFT]: 'Гэрээний төсөл',
  [CaseStage.CONTRACT_SIGNED]: 'Гэрээ байгуулсан',
  [CaseStage.PREPAYMENT_PAID]: 'Урьдчилгаа төлсөн',
  [CaseStage.DOCUMENTS]: 'Материал бүрдүүлэлт',
  [CaseStage.APPLICATION_SUBMITTED]: 'Мэдүүлэг илгээсэн',
  [CaseStage.ADMITTED]: 'Элсэлт баталгаажсан',
  [CaseStage.TUITION_INVOICED]: 'Сургалтын төлбөрийн нэхэмжлэх ирсэн',
  [CaseStage.INVITATION_RECEIVED]: 'Урилга ирсэн',
  [CaseStage.GKS_ROUND1_PASSED]: 'Тэтгэлгийн 1-р шатанд тэнцсэн',
  [CaseStage.GKS_ROUND2_PASSED]: 'Тэтгэлгийн 2-р шатанд тэнцсэн',
  [CaseStage.VISA]: 'Виз мэдүүлэлт',
  [CaseStage.VISA_APPROVED]: 'Виз гарсан',
  [CaseStage.BALANCE_PAID]: 'Үлдэгдэл төлбөр төлсөн',
  [CaseStage.COLLATERAL_CONTRACT]: 'Барьцааны гэрээ',
  [CaseStage.PRE_DEPARTURE]: 'Явахын өмнөх бэлтгэл',
  [CaseStage.DEPARTED]: 'Мордсон',
  [CaseStage.COMPLETED]: 'Дууссан',
  [CaseStage.ON_HOLD]: 'Түр зогссон',
  [CaseStage.CANCELLED]: 'Цуцалсан',
  [CaseStage.REJECTED]: 'Татгалзсан',
};
