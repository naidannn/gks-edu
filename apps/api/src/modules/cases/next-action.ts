import type { BalanceTrigger, CaseStage, ContractStatus, ContractType, PaymentKind, PaymentStatus, ServiceType } from '../../prisma/client.js';

/**
 * "Юу хийх ёстой вэ?" — one sentence per case, derived from the stage graph
 * plus whatever the aggregates below it already know (1G-15).
 *
 * It lives on the server so the portal dashboard, the case header and any
 * future notification template all answer the question the same way.
 */

/** Who the ball is with. The portal only offers a button when it is `CLIENT`. */
export type NextActionActor = 'CLIENT' | 'STAFF' | 'SCHOOL' | 'NONE';

/** Which case tab holds the action — the web app owns the actual URLs. */
export type CaseTab = 'overview' | 'contract' | 'payment' | 'documents' | 'application' | 'visa' | 'departure';

export interface NextAction {
  key: string;
  actor: NextActionActor;
  /** Short imperative, used as the CTA label. */
  label: string;
  /** One sentence of context under it. */
  description: string;
  tab: CaseTab;
  /**
   * Days left until the intake's internal deadline, set only while the ball is
   * with the client and the date is close enough to matter (1H-09).
   *
   * It decorates the action rather than replacing it: a client who is late
   * still needs to be told *what* to do — the countdown only says how fast.
   * `null` when there is no intake, no deadline, or no hurry.
   */
  urgentDaysLeft?: number | null;
}

export interface StageProgressLike {
  requiredTotal: number;
  requiredDone: number;
  awaitingReview: number;
  needsFix: number;
}

export interface CaseSnapshot {
  serviceType: ServiceType;
  stage: CaseStage;
  contract: {
    type: ContractType;
    status: ContractStatus;
    acceptedAt: Date | null;
    otpVerifiedAt: Date | null;
    balanceTriggerSnapshot: BalanceTrigger;
  } | null;
  payments: { kind: PaymentKind; status: PaymentStatus }[];
  admissionDocs: StageProgressLike;
  visaDocs: StageProgressLike;
  /** From the case's `IntakeTerm`; negative once our deadline has passed. */
  daysUntilIntakeDeadline?: number | null;
}

const WAIT_FOR_STAFF: NextAction = {
  key: 'STAFF_REVIEW',
  actor: 'STAFF',
  label: 'Ажилтны хариу хүлээж байна',
  description: 'Таны зөвлөх дараагийн алхмыг бэлтгэж байна. Шаардлагатай бол тантай холбогдоно.',
  tab: 'overview',
};

/** Inside this many days the intake deadline is worth shouting about. */
const URGENT_WINDOW_DAYS = 30;

export function nextAction(snapshot: CaseSnapshot): NextAction {
  return withIntakeUrgency(resolveAction(snapshot), snapshot);
}

/**
 * Marks the action urgent when the client is the one holding it up and their
 * round is closing. Staff- and school-owned steps are left alone: telling a
 * client to hurry while they are waiting on somebody else is just noise.
 */
function withIntakeUrgency(action: NextAction, snapshot: CaseSnapshot): NextAction {
  const daysLeft = snapshot.daysUntilIntakeDeadline;
  if (action.actor !== 'CLIENT' || daysLeft === null || daysLeft === undefined) return action;
  if (daysLeft > URGENT_WINDOW_DAYS) return action;

  const suffix =
    daysLeft < 0
      ? ' Манай бүртгэлийн хугацаа хэтэрсэн байна — зөвлөхтэйгээ яаралтай холбогдоно уу.'
      : daysLeft === 0
        ? ' Манай бүртгэлийн эцсийн хугацаа өнөөдөр дуусна.'
        : ` Элсэлтийн бүртгэл хаагдахад ${daysLeft} хоног үлдлээ.`;

  return { ...action, description: action.description + suffix, urgentDaysLeft: daysLeft };
}

function resolveAction(snapshot: CaseSnapshot): NextAction {
  switch (snapshot.stage) {
    case 'CONTRACT_DRAFT':
      return contractAction(snapshot);

    case 'CONTRACT_SIGNED':
      return paymentAction(snapshot, 'PREPAYMENT', 'Урьдчилгаа төлбөрөө төлөх', 'Гэрээ баталгаажлаа. Урьдчилгаа төлбөрөө QPay-ээр төлснөөр материал бүрдүүлэлт нээгдэнэ.');

    case 'PREPAYMENT_PAID':
    case 'DOCUMENTS':
      return documentAction(snapshot);

    case 'APPLICATION_SUBMITTED':
      return {
        key: 'SCHOOL_REVIEW',
        actor: 'SCHOOL',
        label: 'Сургуулийн хариу хүлээж байна',
        description: 'Таны мэдүүлэг сургуульд илгээгдсэн. Хариу ирмэгц энд шинэчлэгдэнэ.',
        tab: 'application',
      };

    case 'ADMITTED':
      return {
        key: 'TUITION_PREP',
        actor: 'STAFF',
        label: 'Сургалтын төлбөрийн нэхэмжлэх бэлтгэгдэж байна',
        description: 'Та элсэлт авлаа. Сургуулийн нэхэмжлэх ирмэгц "Мэдүүлэг" хэсэгт харагдана.',
        tab: 'application',
      };

    case 'TUITION_INVOICED':
      return {
        key: 'TUITION_INVOICE',
        actor: 'CLIENT',
        label: 'Сургалтын төлбөрийн нэхэмжлэхтэй танилцах',
        description: 'Сургуулийн нэхэмжлэх ирсэн байна. Төлбөрийн дүн, хугацааг шалгана уу.',
        tab: 'application',
      };

    case 'INVITATION_RECEIVED':
      return {
        key: 'VISA_START',
        actor: 'CLIENT',
        label: 'Визний материалаа бүрдүүлэх',
        description: 'Сургуулийн урилга ирлээ. Одоо визний материал бүрдүүлэлт эхэлнэ.',
        tab: 'visa',
      };

    case 'GKS_ROUND1_PASSED':
      return {
        key: 'GKS_ROUND2',
        actor: 'SCHOOL',
        label: '2-р шатны хариу хүлээж байна',
        description: 'Та тэтгэлгийн 1-р шатанд тэнцлээ. 2-р шатны дүн гармагц энд харагдана.',
        tab: 'application',
      };

    case 'GKS_ROUND2_PASSED':
      return paymentAction(snapshot, 'BALANCE', 'Үлдэгдэл төлбөрөө төлөх', 'Та тэтгэлэгт тэнцлээ. Гэрээний дагуу үлдэгдэл төлбөр төлөгдөнө.');

    case 'VISA':
      return visaAction(snapshot);

    case 'VISA_APPROVED':
      return snapshot.contract?.balanceTriggerSnapshot === 'AFTER_VISA_APPROVED'
        ? paymentAction(snapshot, 'BALANCE', 'Үлдэгдэл төлбөрөө төлөх', 'Виз гарлаа. Гэрээний дагуу үлдэгдэл төлбөр төлөгдөнө.')
        : WAIT_FOR_STAFF;

    case 'BALANCE_PAID':
      return snapshot.serviceType === 'LANGUAGE_PREP'
        ? {
            key: 'COLLATERAL_CONTRACT',
            actor: 'STAFF',
            label: 'Барьцааны гэрээ байгуулах',
            description: 'Хэлний бэлтгэлийн үйлчилгээнд барьцааны гэрээг оффист биетээр байгуулна.',
            tab: 'contract',
          }
        : WAIT_FOR_STAFF;

    case 'COLLATERAL_CONTRACT':
      return WAIT_FOR_STAFF;

    case 'PRE_DEPARTURE':
      return {
        key: 'DEPARTURE_CHECKLIST',
        actor: 'CLIENT',
        label: 'Явахын өмнөх бэлтгэлээ хийх',
        description: 'Билет, даатгал, байр, SIM — чеклистээ ажилтантай хамт бөглөнө үү.',
        tab: 'departure',
      };

    case 'DEPARTED':
      return {
        key: 'DEPARTED',
        actor: 'NONE',
        label: 'Та мордлоо',
        description: 'Аяны зам тань өлзийтэй байг. Асуудал гарвал зөвлөхтэйгээ холбогдоорой.',
        tab: 'departure',
      };

    case 'COMPLETED':
      return {
        key: 'COMPLETED',
        actor: 'NONE',
        label: 'Үйлчилгээ дууссан',
        description: 'Энэ хэргийн бүх алхам дууссан байна.',
        tab: 'overview',
      };

    case 'ON_HOLD':
      return {
        key: 'ON_HOLD',
        actor: 'STAFF',
        label: 'Түр зогссон',
        description: 'Хэрэг түр зогссон байна. Үргэлжлүүлэхийн тулд зөвлөхтэйгээ холбогдоно уу.',
        tab: 'overview',
      };

    case 'CANCELLED':
    case 'REJECTED':
      return {
        key: snapshot.stage,
        actor: 'NONE',
        label: snapshot.stage === 'CANCELLED' ? 'Хэрэг цуцлагдсан' : 'Татгалзсан',
        description: 'Дэлгэрэнгүй тайлбарыг зөвлөхөөсөө авна уу.',
        tab: 'overview',
      };

    default:
      return WAIT_FOR_STAFF;
  }
}

function contractAction(snapshot: CaseSnapshot): NextAction {
  const contract = snapshot.contract;
  if (!contract) {
    return {
      key: 'CONTRACT_MISSING',
      actor: 'STAFF',
      label: 'Гэрээ бэлтгэгдэж байна',
      description: 'Энэ хэрэгт гэрээ хараахан үүсээгүй байна. Зөвлөхтэйгээ холбогдоно уу.',
      tab: 'contract',
    };
  }
  if (contract.type === 'PHYSICAL') {
    return {
      key: 'CONTRACT_PHYSICAL',
      actor: 'STAFF',
      label: 'Биет гэрээ бүртгэгдэхийг хүлээж байна',
      description: 'Гэрээг оффист гарын үсэг зурсны дараа ажилтан бүртгэнэ.',
      tab: 'contract',
    };
  }
  if (!contract.acceptedAt) {
    return {
      key: 'CONTRACT_ACCEPT',
      actor: 'CLIENT',
      label: 'Гэрээтэй танилцаж, зөвшөөрөх',
      description: 'Зуучлалын гэрээний нөхцөлийг уншаад зөвшөөрснөөр утсанд тань баталгаажуулах код очно.',
      tab: 'contract',
    };
  }
  return {
    key: 'CONTRACT_OTP',
    actor: 'CLIENT',
    label: 'Баталгаажуулах кодоо оруулах',
    description: 'Утсанд тань илгээсэн 6 оронтой кодыг оруулснаар гэрээ хүчин төгөлдөр болно.',
    tab: 'contract',
  };
}

function paymentAction(snapshot: CaseSnapshot, kind: PaymentKind, label: string, description: string): NextAction {
  const pending = snapshot.payments.some((payment) => payment.kind === kind && payment.status === 'PENDING');
  return {
    key: pending ? `${kind}_PENDING` : kind,
    actor: 'CLIENT',
    label: pending ? 'QPay-ээр төлбөрөө баталгаажуулах' : label,
    description: pending
      ? 'Нэхэмжлэх үүссэн байна. QPay апп-аар QR кодыг уншуулж төлнө үү — төлбөр орсныг систем өөрөө шалгана.'
      : description,
    tab: 'payment',
  };
}

function documentAction(snapshot: CaseSnapshot): NextAction {
  const docs = snapshot.admissionDocs;

  if (docs.requiredTotal === 0) {
    return {
      key: 'CONDITIONS',
      actor: 'CLIENT',
      label: 'Материалын нөхцөлийн анкет бөглөх',
      description: 'Боловсрол, батлан даагчийн мэдээллээ бөглөснөөр танд яг тохирох материалын жагсаалт үүснэ.',
      tab: 'documents',
    };
  }
  if (docs.needsFix > 0) {
    return {
      key: 'DOC_FIX',
      actor: 'CLIENT',
      label: `Засвар шаардсан ${docs.needsFix} материалыг дахин илгээх`,
      description: 'Ажилтны тайлбарыг уншаад залруулсан хувилбарыг дахин байршуулна уу.',
      tab: 'documents',
    };
  }
  if (docs.requiredDone < docs.requiredTotal) {
    return {
      key: 'DOC_UPLOAD',
      actor: 'CLIENT',
      label: `Материалаа бүрдүүлэх (${docs.requiredDone}/${docs.requiredTotal})`,
      description: 'Жагсаалтын дутуу материалуудыг байршуулаарай. Заавар бүр материалын доор байна.',
      tab: 'documents',
    };
  }
  if (docs.awaitingReview > 0) {
    return {
      key: 'DOC_REVIEW',
      actor: 'STAFF',
      label: 'Материал шалгагдаж байна',
      description: 'Бүх материал илгээгдсэн. Ажилтан шалгаж, шаардлагатай бол засвар хүснэ.',
      tab: 'documents',
    };
  }
  return {
    key: 'APPLICATION_READY',
    actor: 'STAFF',
    label: 'Мэдүүлэг илгээхэд бэлэн',
    description: 'Материал бүрэн бүрдсэн. Ажилтан сургуульд мэдүүлгийг илгээнэ.',
    tab: 'application',
  };
}

function visaAction(snapshot: CaseSnapshot): NextAction {
  const docs = snapshot.visaDocs;
  if (docs.needsFix > 0 || docs.requiredDone < docs.requiredTotal) {
    return {
      key: 'VISA_DOCS',
      actor: 'CLIENT',
      label: `Визний материалаа бүрдүүлэх (${docs.requiredDone}/${docs.requiredTotal})`,
      description: 'Визний материалын жагсаалт "Виз" хэсэгт байна.',
      tab: 'visa',
    };
  }
  return {
    key: 'VISA_SUBMITTED',
    actor: 'STAFF',
    label: 'Визний хариу хүлээж байна',
    description: 'Визний материал бүрдсэн. Элчин сайдын яамны хариуг хүлээж байна.',
    tab: 'visa',
  };
}
