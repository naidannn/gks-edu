import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import { OtpService } from '../../sms/otp.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  CaseStage,
  ContractStatus,
  ContractType,
  NotificationEvent,
  type Prisma,
  Role,
  type ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import { SERVICE_TYPE_LABELS } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { ContractPdfService } from './contract-pdf.service.js';
import { ADULT_AGE, ageOn } from '../clients/dto/client-fields.js';
import { formatAmount, renderContractBody } from './contract-template.util.js';
import type { AcceptContractDto } from './dto/accept-contract.dto.js';
import type { CreateContractDto } from './dto/create-contract.dto.js';
import type { CreateContractTemplateDto } from './dto/create-contract-template.dto.js';
import type { QueryContractsDto } from './dto/query-contracts.dto.js';
import type { RegisterPhysicalContractDto } from './dto/register-physical-contract.dto.js';
import type { UpsertCollateralContractDto } from './dto/upsert-collateral-contract.dto.js';

const STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT] as const;
const CONTRACT_TITLE: Record<ServiceType, string> = {
  LANGUAGE_PREP: 'ЗУУЧЛАЛЫН ГЭРЭЭ — Хэлний бэлтгэл',
  BACHELOR: 'ЗУУЧЛАЛЫН ГЭРЭЭ — Бакалавр',
  MASTER: 'ЗУУЧЛАЛЫН ГЭРЭЭ — Магистр',
  PHD: 'ЗУУЧЛАЛЫН ГЭРЭЭ — Доктор',
  GKS_SCHOLARSHIP: 'ЗУУЧЛАЛЫН ГЭРЭЭ — Засгийн газрын тэтгэлэг',
};

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
      include: { user: { include: { client: true } }, university: true, contract: true },
    });
    if (!gksCase) throw new NotFoundException(`Case ${dto.caseId} not found`);
    if (gksCase.contract) throw new BadRequestException('Энэ хэрэгт аль хэдийн гэрээ үүссэн байна');
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

    const { prepayment, balance } = PricingService.amounts(pricing);
    const bodyMn = renderContractBody(template.bodyMn, {
      contractDate: new Date().toLocaleDateString('en-CA'),
      userName: client ? `${client.lastName} ${client.firstName}` : (gksCase.user.name ?? gksCase.user.email ?? '—'),
      userRegister: client?.registerNumber ?? '—',
      userBirthDate: client ? client.birthDate.toLocaleDateString('en-CA') : '—',
      userPhone: client?.phone ?? gksCase.user.phone ?? '—',
      userAddress: client?.address ?? '—',
      guardianName:
        signedForByGuardian && client?.guardianLastName
          ? `${client.guardianLastName} ${client.guardianFirstName ?? ''}`.trim()
          : '—',
      guardianRegister: signedForByGuardian ? (client?.guardianRegisterNumber ?? '—') : '—',
      guardianRelation: signedForByGuardian ? (client?.guardianRelation ?? '—') : '—',
      universityName: gksCase.university?.nameMn ?? 'Тодорхойгүй (сургууль сонголт хийгдээгүй)',
      totalAmount: formatAmount(pricing.totalAmount),
      prepaymentAmount: formatAmount(prepayment),
      balanceAmount: formatAmount(balance),
      paymentSchedule: `Гэрээ байгуулах үед ${formatAmount(prepayment)}₮, ${
        pricing.balanceTrigger === 'AFTER_SCHOLARSHIP_RESULT' ? 'тэтгэлэгт тэнцсэний дараа' : 'виз гарсны дараа'
      } үлдэгдэл ${formatAmount(balance)}₮`,
    });

    return this.prisma.contract.create({
      data: {
        caseId: gksCase.id,
        userId: gksCase.userId,
        type: dto.type,
        status: dto.type === ContractType.ELECTRONIC ? ContractStatus.SENT : ContractStatus.DRAFT,
        totalAmountSnapshot: pricing.totalAmount,
        prepaymentModeSnapshot: pricing.prepaymentMode,
        prepaymentValueSnapshot: pricing.prepaymentValue,
        balanceTriggerSnapshot: pricing.balanceTrigger,
        refundPolicy: {},
        bodyMn,
      },
    });
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
      title: CONTRACT_TITLE[full.case.serviceType],
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
        // There is no separate contract number — the case code identifies it (§5.4).
        contractNumber: full.case.code,
        serviceName: SERVICE_TYPE_LABELS[full.case.serviceType],
      },
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
    const isStaff = (STAFF_ROLES as readonly Role[]).includes(user.role);
    if (!isStaff && contract.userId !== user.id) {
      throw new ForbiddenException('Энэ гэрээнд хандах эрхгүй байна');
    }
  }

  private async getOrThrow(id: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id }, include: { collateralContract: true } });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    return contract;
  }
}
