import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import { OtpService } from '../../sms/otp.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { isCrmStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { DecimalLike } from '../../common/utils/decimal.js';
import {
  BalanceTrigger,
  CaseStage,
  ContractStatus,
  ContractType,
  NotificationEvent,
  type PrepaymentMode,
  type Prisma,
  type ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import { SERVICE_TYPE_LABELS } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SlackService } from '../notifications/slack.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { amountInWordsMnCapitalized } from './amount-words.util.js';
import { ContractPdfService } from './contract-pdf.service.js';
import { ADULT_AGE, ageOn } from '../clients/dto/client-fields.js';
import {
  type ContractUniversityChoice,
  formatAmount,
  formatAmountExact,
  renderContractBody,
  universityNames,
} from './contract-template.util.js';
import type { AcceptContractDto } from './dto/accept-contract.dto.js';
import type { CreateContractDto } from './dto/create-contract.dto.js';
import type { CreateContractTemplateDto } from './dto/create-contract-template.dto.js';
import type { QueryContractsDto } from './dto/query-contracts.dto.js';
import type { RegisterPhysicalContractDto } from './dto/register-physical-contract.dto.js';
import type { UpsertCollateralContractDto } from './dto/upsert-collateral-contract.dto.js';


/**
 * One title for every service, the way the office's signed Word contract
 * (`geree.docx`) heads the page — §1.1 of
 * the body already names the programmes the contract covers.
 */
export const CONTRACT_TITLE = 'СУРГАЛТ ЗУУЧЛАЛЫН ГЭРЭЭ';
export const CONTRACT_SUBTITLE = 'EDUCATIONAL MEDIATION AGREEMENT';
/** `СГ` = "сургалт, зуучлал"; the sequence restarts every calendar year. */
const CONTRACT_NUMBER_PREFIX = 'СГ';

/**
 * §2.2 names the moment the balance falls due, and that moment is service
 * configuration (`ServicePricing.balanceTrigger`), never a constant — regular
 * brokerage bills after the visa, a GKS case after the scholarship result
 * (`gksedu.md` §9).
 */
export const BALANCE_CONDITION: Record<BalanceTrigger, string> = {
  [BalanceTrigger.AFTER_VISA_APPROVED]:
    'Зуучлуулагчид БНСУ-ын зохих төрлийн виз олгогдсоны дараа Зуучлагч тал энэ талаар Зуучлуулагчид боломжит богино хугацаанд мэдэгдэх бөгөөд үүний үндсэн дээр Зуучлуулагч нь үлдэгдэл төлбөрийг төлнө',
  [BalanceTrigger.AFTER_SCHOLARSHIP_RESULT]:
    'БНСУ-ын Засгийн газрын тэтгэлэгт хөтөлбөрийн албан ёсны үр дүн зарлагдаж, Зуучлуулагч тэтгэлэгт тэнцсэн тухай мэдэгдэл ирмэгц Зуучлагч тал энэ талаар Зуучлуулагчид боломжит богино хугацаанд мэдэгдэх бөгөөд үүний үндсэн дээр Зуучлуулагч нь үлдэгдэл төлбөрийг төлнө',
};

/**
 * The statuses whose body is still only a draft on our side — nobody has put a
 * name to it, so correcting the client record may still correct it (1C-30).
 * From `SIGNED` on, the text is what two people agreed to.
 */
const REWRITABLE_STATUSES: ContractStatus[] = [ContractStatus.DRAFT, ContractStatus.SENT];

/** What a client edit did to that client's contracts (1C-30). */
export interface ContractSyncResult {
  /** Unsigned contracts re-rendered with the corrected details. */
  refreshed: number;
  /** Signed contracts left untouched — they are reissued by hand, if at all. */
  locked: number;
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly pricing: PricingService,
    private readonly pdf: ContractPdfService,
    private readonly storage: StorageService,
    private readonly otp: OtpService,
    private readonly notifications: NotificationsService,
    private readonly slack: SlackService,
  ) {}

  // ─── Templates (1C-06) ────────────────────────────────────────────────────

  async listTemplates(serviceType?: ServiceType) {
    return this.prisma.contractTemplate.findMany({
      where: serviceType ? { serviceType } : undefined,
      orderBy: [{ serviceType: 'asc' }, { version: 'desc' }],
    });
  }

  async createTemplate(dto: CreateContractTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.contractTemplate.findFirst({
        where: { serviceType: dto.serviceType, isActive: true },
      });
      if (current) {
        await tx.contractTemplate.update({ where: { id: current.id }, data: { isActive: false } });
      }
      return tx.contractTemplate.create({
        data: { serviceType: dto.serviceType, bodyMn: dto.bodyMn, version: (current?.version ?? 0) + 1, isActive: true },
      });
    });
  }

  // ─── Issuing a contract (1C-05, 1C-06) ────────────────────────────────────

  async createForCase(dto: CreateContractDto) {
    const gksCase = await this.prisma.case.findUnique({
      where: { id: dto.caseId },
      include: {
        user: { include: { client: true } },
        university: true,
        contract: true,
        universityChoices: {
          orderBy: { sortOrder: 'asc' },
          select: { track: true, university: { select: { nameMn: true } } },
        },
      },
    });
    if (!gksCase) throw new NotFoundException(`Үйлчилгээ ${dto.caseId} олдсонгүй`);
    if (gksCase.contract) throw new BadRequestException('Энэ үйлчилгээнд аль хэдийн гэрээ үүссэн байна');
    if (gksCase.stage !== CaseStage.CONTRACT_DRAFT) {
      throw new BadRequestException('Гэрээг зөвхөн CONTRACT_DRAFT шатанд үүсгэнэ');
    }

    const [pricing, template] = await Promise.all([
      this.pricing.getActive(gksCase.serviceType),
      this.prisma.contractTemplate.findFirst({
        where: { serviceType: gksCase.serviceType, isActive: true },
        orderBy: { version: 'desc' },
      }),
    ]);
    if (!template) throw new NotFoundException(`${gksCase.serviceType} үйлчилгээнд идэвхтэй гэрээний загвар алга байна`);

    // The client record is where the contract's legal identity lives (1B-14):
    // full name, register number, and the guardian who signs for a minor.
    const client = gksCase.user.client;
    const signedForByGuardian = Boolean(client && ageOn(client.birthDate) < ADULT_AGE);

    const contractDate = new Date();
    const bodyMn = renderContractBody(
      template.bodyMn,
      contractTokens({
        user: gksCase.user,
        client,
        signedForByGuardian,
        contractDate,
        universityChoices: gksCase.universityChoices,
        universityFallback: gksCase.university?.nameMn ?? null,
        money: pricing,
      }),
    );

    return this.prisma.contract.create({
      data: {
        caseId: gksCase.id,
        userId: gksCase.userId,
        number: await this.nextContractNumber(contractDate),
        type: dto.type,
        status: dto.type === ContractType.ELECTRONIC ? ContractStatus.SENT : ContractStatus.DRAFT,
        templateId: template.id,
        totalAmountSnapshot: pricing.totalAmount,
        prepaymentModeSnapshot: pricing.prepaymentMode,
        prepaymentValueSnapshot: pricing.prepaymentValue,
        balanceTriggerSnapshot: pricing.balanceTrigger,
        refundPolicy: {},
        bodyMn,
      },
    });
  }

  /**
   * Re-renders every contract of a user that nobody has signed yet (1C-30).
   *
   * The body is a snapshot taken when the contract was issued, so a register
   * number typed wrong at registration stays wrong on the draft long after the
   * client record is corrected — which is exactly the paper the office then
   * prints. Correcting the client corrects the drafts with it.
   *
   * What it deliberately does not touch: the money, the contract number and the
   * issue date, all read back from the contract's own snapshot; and any
   * contract already signed — that one is a legal record of what two people
   * agreed to, and it is reissued by hand, not rewritten behind their backs.
   */
  async refreshUnsignedForUser(userId: string): Promise<ContractSyncResult> {
    const contracts = await this.prisma.contract.findMany({
      where: { userId },
      include: {
        template: true,
        case: {
          include: {
            user: { include: { client: true } },
            university: true,
            universityChoices: {
              orderBy: { sortOrder: 'asc' },
              select: { track: true, university: { select: { nameMn: true } } },
            },
          },
        },
      },
    });

    const result: ContractSyncResult = { refreshed: 0, locked: 0 };

    for (const contract of contracts) {
      // A contract issued before `templateId` was recorded falls back to the
      // service's active template — the same text it would be reissued from.
      const template =
        contract.template ??
        (await this.prisma.contractTemplate.findFirst({
          where: { serviceType: contract.case.serviceType, isActive: true },
          orderBy: { version: 'desc' },
        }));
      if (!template) continue;

      const client = contract.case.user.client;
      const bodyMn = renderContractBody(
        template.bodyMn,
        contractTokens({
          user: contract.case.user,
          client,
          signedForByGuardian: Boolean(client && ageOn(client.birthDate) < ADULT_AGE),
          contractDate: contract.createdAt,
          universityChoices: contract.case.universityChoices,
          universityFallback: contract.case.university?.nameMn ?? null,
          money: {
            totalAmount: contract.totalAmountSnapshot,
            prepaymentMode: contract.prepaymentModeSnapshot,
            prepaymentValue: contract.prepaymentValueSnapshot,
            balanceTrigger: contract.balanceTriggerSnapshot,
          },
        }),
      );

      // Nothing the contract says changed — a signed contract is only worth
      // warning about when the correction would actually have reached it.
      if (bodyMn === contract.bodyMn) continue;

      if (!REWRITABLE_STATUSES.includes(contract.status)) {
        result.locked += 1;
        continue;
      }

      await this.prisma.contract.update({ where: { id: contract.id }, data: { bodyMn } });
      result.refreshed += 1;
    }

    return result;
  }

  // ─── Reading ───────────────────────────────────────────────────────────────

  async findAllStaff(query: QueryContractsDto) {
    const where: Prisma.ContractWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.q) {
      where.OR = [
        { case: { code: { contains: query.q, mode: 'insensitive' } } },
        { user: { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q, mode: 'insensitive' } }] } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } }, case: { select: { id: true, code: true, serviceType: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.contract.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async stats() {
    const [total, groups] = await Promise.all([
      this.prisma.contract.count(),
      this.prisma.contract.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(groups.map((group) => [group.status, group._count._all])),
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const contract = await this.getOrThrow(id);
    this.assertAccess(contract, user);
    return contract;
  }

  async downloadUrl(id: string, user: AuthenticatedUser) {
    const contract = await this.getOrThrow(id);
    this.assertAccess(contract, user);
    if (!contract.pdfPath) throw new BadRequestException('Гэрээний PDF хараахан үүсээгүй байна');
    const { token } = this.storage.sign(contract.pdfPath);
    return { downloadUrl: `/api/v1/files/${token}` };
  }

  /**
   * The paper copy (1C-25). A physical contract is signed with a pen, so the
   * office needs the sheet *before* there is anything to scan back in, and
   * `pdfPath` is only written once a contract is signed. This renders the body
   * frozen at issue through the same `ContractPdfService` the archived copy
   * goes through, and stores nothing — the file worth keeping is the scan.
   *
   * The e-signature audit line is carried only by a signed electronic
   * contract: an unsigned one prints blank signature lines to sign on, and a
   * physical one was signed by hand, so stamping it "цахимаар баталгаажсан"
   * would be a lie on paper.
   */
  async renderPrintable(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const contract = await this.getOrThrow(id);
    const isESigned = contract.type === ContractType.ELECTRONIC && Boolean(contract.signedAt);

    const buffer = await this.pdf.render({
      title: CONTRACT_TITLE,
      subtitle: CONTRACT_SUBTITLE,
      number: contract.number,
      contractDate: contract.createdAt,
      bodyMn: contract.bodyMn,
      signedAt: isESigned ? contract.signedAt : null,
      signedIp: isESigned ? contract.signedIp : null,
    });

    return { buffer, filename: `Гэрээ-${contract.number.replace(/\//g, '-')}.pdf` };
  }

  // ─── Electronic e-sign flow (1C-08) ────────────────────────────────────────

  async accept(id: string, dto: AcceptContractDto, user: AuthenticatedUser) {
    const contract = await this.getOrThrow(id);
    this.assertOwner(contract, user);
    this.assertElectronicSendable(contract);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { phone: dto.phone } }),
      this.prisma.contract.update({ where: { id }, data: { acceptedAt: new Date() } }),
    ]);
    await this.otp.issue(id, dto.phone);
    return { sent: true };
  }

  async verifyOtp(id: string, code: string, user: AuthenticatedUser, ip: string | undefined) {
    const contract = await this.getOrThrow(id);
    this.assertOwner(contract, user);
    this.assertElectronicSendable(contract);
    if (!contract.acceptedAt) throw new BadRequestException('Эхлээд гэрээний нөхцөлийг зөвшөөрч OTP код авна уу');

    const valid = await this.otp.verify(id, code);
    if (!valid) throw new BadRequestException('OTP код буруу эсвэл хугацаа дууссан байна');

    return this.finalizeSigning(contract, { signedAt: new Date(), signedIp: ip ?? null });
  }

  // ─── Physical contract registration (1C-09) ────────────────────────────────

  async registerPhysical(id: string, dto: RegisterPhysicalContractDto, scanBuffer: Buffer) {
    const contract = await this.getOrThrow(id);
    if (contract.type !== ContractType.PHYSICAL) {
      throw new BadRequestException('Энэ endpoint зөвхөн PHYSICAL гэрээнд зориулагдсан');
    }
    if (contract.status === ContractStatus.SIGNED) {
      throw new BadRequestException('Гэрээ аль хэдийн бүртгэгдсэн байна');
    }

    const { path } = await this.storage.upload({ caseId: contract.caseId, docCode: 'CONTRACT_SCAN', buffer: scanBuffer });
    await this.prisma.contract.update({ where: { id }, data: { physicalScanPath: path } });

    return this.finalizeSigning(contract, { signedAt: new Date(dto.signedAt), signedIp: null });
  }

  // ─── Collateral contract (1C-10) ───────────────────────────────────────────

  async upsertCollateral(contractId: string, dto: UpsertCollateralContractDto, fileBuffer?: Buffer) {
    const contract = await this.getOrThrow(contractId);

    let filePath: string | undefined;
    if (fileBuffer) {
      const { path } = await this.storage.upload({ caseId: contract.caseId, docCode: 'COLLATERAL_CONTRACT', buffer: fileBuffer });
      filePath = path;
    }

    return this.prisma.collateralContract.upsert({
      where: { contractId },
      create: {
        contractId,
        isSigned: dto.isSigned ?? false,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        filePath,
      },
      update: {
        ...(dto.isSigned !== undefined ? { isSigned: dto.isSigned } : {}),
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(filePath ? { filePath } : {}),
      },
    });
  }

  // ─── Shared internals ───────────────────────────────────────────────────────

  /** Renders + stores the final PDF, marks the contract SIGNED, and advances the case (1C-15 groundwork). */
  private async finalizeSigning(
    contract: { id: string; caseId: string; bodyMn: string },
    signature: { signedAt: Date; signedIp: string | null },
  ) {
    const full = await this.prisma.contract.findUniqueOrThrow({ where: { id: contract.id }, include: { case: true } });

    const pdfBuffer = await this.pdf.render({
      title: CONTRACT_TITLE,
      subtitle: CONTRACT_SUBTITLE,
      number: full.number,
      contractDate: full.createdAt,
      bodyMn: full.bodyMn,
      signedAt: signature.signedAt,
      signedIp: signature.signedIp,
    });
    const { path: pdfPath } = await this.storage.upload({ caseId: contract.caseId, docCode: 'CONTRACT_PDF', buffer: pdfBuffer });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contract.update({
        where: { id: contract.id },
        data: {
          status: ContractStatus.SIGNED,
          signedAt: signature.signedAt,
          signedIp: signature.signedIp,
          otpVerifiedAt: full.type === ContractType.ELECTRONIC ? signature.signedAt : null,
          pdfPath,
        },
      });
      await this.cases.applySystemTransition(tx, contract.caseId, CaseStage.CONTRACT_SIGNED);
      return row;
    });

    // §16 "Гэрээ баталгаажсан" — outside the transaction so a queue hiccup
    // cannot roll back a signed contract (1G-02).
    await this.notifications.dispatch({
      event: NotificationEvent.CONTRACT_CONFIRMED,
      userIds: [full.case.userId],
      caseId: full.caseId,
      context: {
        caseId: full.caseId,
        caseCode: full.case.code,
        contractNumber: full.number,
        serviceName: SERVICE_TYPE_LABELS[full.case.serviceType],
      },
    });

    await this.slack.notify({
      emoji: '✍️',
      title: 'Гэрээнд гарын үсэг зурагдлаа',
      fields: [
        { label: 'Гэрээний дугаар', value: full.number },
        { label: 'Үйлчилгээ', value: full.case.code },
        { label: 'Үйлчилгээ', value: SERVICE_TYPE_LABELS[full.case.serviceType] },
        { label: 'Хэлбэр', value: full.type === ContractType.ELECTRONIC ? 'Цахим' : 'Цаасан' },
      ],
      // The contract admin screen is a list, not a detail page — the case is
      // where the signed PDF is actually opened.
      link: { label: 'Үйлчилгээг нээх', path: `/admin/cases/${full.caseId}` },
    });

    return updated;
  }

  private assertElectronicSendable(contract: { type: ContractType; status: ContractStatus }): void {
    if (contract.type !== ContractType.ELECTRONIC) {
      throw new BadRequestException('Энэ endpoint зөвхөн ELECTRONIC гэрээнд зориулагдсан');
    }
    if (contract.status === ContractStatus.SIGNED) {
      throw new BadRequestException('Гэрээ аль хэдийн гарын үсэг зурагдсан байна');
    }
  }

  private assertOwner(contract: { userId: string }, user: AuthenticatedUser): void {
    if (contract.userId !== user.id) throw new ForbiddenException('Энэ гэрээ танд харьяалагдахгүй байна');
  }

  private assertAccess(contract: { userId: string }, user: AuthenticatedUser): void {
    if (!isCrmStaff(user.role) && contract.userId !== user.id) {
      throw new ForbiddenException('Энэ гэрээнд хандах эрхгүй байна');
    }
  }

  /**
   * `СГ/26/001` — the next free number in the current calendar year. The unique
   * index is the real guard: two consultants issuing a contract in the same
   * second both read the same count, and the loser simply takes the next one.
   */
  private async nextContractNumber(on: Date, attempt = 0): Promise<string> {
    const yearStart = new Date(on.getFullYear(), 0, 1);
    const nextYearStart = new Date(on.getFullYear() + 1, 0, 1);
    const issued = await this.prisma.contract.count({
      where: { createdAt: { gte: yearStart, lt: nextYearStart } },
    });
    const year = String(on.getFullYear()).slice(-2);
    const sequence = String(issued + 1 + attempt).padStart(3, '0');
    const candidate = `${CONTRACT_NUMBER_PREFIX}/${year}/${sequence}`;

    const taken = await this.prisma.contract.findUnique({ where: { number: candidate }, select: { id: true } });
    return taken ? this.nextContractNumber(on, attempt + 1) : candidate;
  }

  private async getOrThrow(id: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id }, include: { collateralContract: true } });
    if (!contract) throw new NotFoundException(`Гэрээ ${id} олдсонгүй`);
    return contract;
  }
}

// ─── Template data ──────────────────────────────────────────────────────────

type ContractClient = {
  lastName: string;
  firstName: string;
  registerNumber: string;
  birthDate: Date;
  phone: string;
  email: string | null;
  address: string | null;
  guardianLastName: string | null;
  guardianFirstName: string | null;
  guardianRegisterNumber: string | null;
  guardianRelation: string | null;
};

type ContractUser = { name: string | null; email: string | null; phone: string | null };

/**
 * Everything the contract says about the two people signing it. The client
 * record is where that legal identity lives (1B-14) — full name, register
 * number, and the guardian who signs for a minor. The `userName`/`guardian*`
 * tokens are kept for contract templates written before that Word file.
 */
export function partyTokens(user: ContractUser, client: ContractClient | null, byGuardian: boolean): Record<string, string> {
  const guardianName =
    byGuardian && client?.guardianLastName
      ? `${client.guardianLastName} ${client.guardianFirstName ?? ''}`.trim()
      : '—';

  return {
    userLastName: client?.lastName ?? '—',
    userFirstName: client?.firstName ?? (user.name ?? '—'),
    userShortName: client ? `${client.lastName.charAt(0)}.${client.firstName}` : (user.name ?? '—'),
    userRegister: client?.registerNumber ?? '—',
    userPhone: client?.phone ?? user.phone ?? '—',
    userEmail: client?.email ?? user.email ?? '—',
    userAddress: client?.address ?? '—',
    // A minor is represented by the guardian, so the opening paragraph names
    // them beside the client; an adult leaves no trace of the clause at all.
    guardianNote:
      byGuardian && guardianName !== '—'
        ? `, түүний өмнөөс хууль ёсны төлөөлөгч ${guardianName} /РД: ${client?.guardianRegisterNumber ?? '—'}, ${client?.guardianRelation ?? 'асран хамгаалагч'}/`
        : '',

    userName: client ? `${client.lastName} ${client.firstName}` : (user.name ?? user.email ?? '—'),
    userBirthDate: client ? client.birthDate.toLocaleDateString('en-CA') : '—',
    guardianName,
    guardianRegister: byGuardian ? (client?.guardianRegisterNumber ?? '—') : '—',
    guardianRelation: byGuardian ? (client?.guardianRelation ?? '—') : '—',
  };
}

/**
 * Every `{{token}}` the contract body can use, for one case at one moment.
 *
 * Issuing a contract and re-rendering an unsigned one build the same map: the
 * only difference is where the money and the date come from — the live price
 * list on the first pass, the contract's own snapshot on every later one.
 */
export function contractTokens(input: {
  user: ContractUser;
  client: ContractClient | null;
  signedForByGuardian: boolean;
  contractDate: Date;
  universityChoices: readonly ContractUniversityChoice[];
  universityFallback: string | null;
  money: {
    totalAmount: DecimalLike;
    prepaymentMode: PrepaymentMode;
    prepaymentValue: DecimalLike;
    balanceTrigger: BalanceTrigger;
  };
}): Record<string, string> {
  const { prepayment, balance } = PricingService.amounts(input.money);
  const total = input.money.totalAmount;

  return {
    ...partyTokens(input.user, input.client, input.signedForByGuardian),
    contractDate: input.contractDate.toLocaleDateString('en-CA'),
    signatureDate: formatSignatureDate(input.contractDate),
    universityName: universityNames(input.universityChoices, input.universityFallback),
    totalAmount: formatAmountExact(total),
    totalAmountWords: amountInWordsMnCapitalized(total),
    prepaymentAmount: formatAmountExact(prepayment),
    prepaymentAmountWords: amountInWordsMnCapitalized(prepayment),
    balanceAmount: formatAmountExact(balance),
    balanceAmountWords: amountInWordsMnCapitalized(balance),
    balanceCondition: BALANCE_CONDITION[input.money.balanceTrigger],
    paymentSchedule: `Гэрээ байгуулах үед ${formatAmount(prepayment)}₮, ${
      input.money.balanceTrigger === BalanceTrigger.AFTER_SCHOLARSHIP_RESULT ? 'тэтгэлэгт тэнцсэний дараа' : 'виз гарсны дараа'
    } үлдэгдэл ${formatAmount(balance)}₮`,
  };
}

/** `2026/09/02` — the date beside the client's signature in the Word file. */
export function formatSignatureDate(date: Date): string {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}
