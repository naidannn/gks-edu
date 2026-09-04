import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type CaseConditions,
  type DocStage,
  DocumentStatus,
  type EducationLevel,
  GuarantorType,
  type Prisma,
  type RequirementRule,
  type ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { restorePatch, softDeletePatch } from '../../prisma/soft-delete.js';

/** The case facts a rule is matched against (ARCHITECTURE.md §7.1). */
export interface ResolutionContext {
  serviceType: ServiceType;
  educationLevel: EducationLevel | null;
  guarantorType: GuarantorType;
  guarantorRelation: CaseConditions['guarantorRelation'];
  universityId: string | null;
}

export interface ResolutionSummary {
  stage: DocStage;
  created: number;
  updated: number;
  /** No longer required and never worked on — soft-deleted. */
  removed: number;
  /** No longer required but already submitted — deliberately left in place (§7.1). */
  keptDespiteUnmatched: number;
}

/**
 * 1D-04 — turns `(stage, serviceType, educationLevel, university, guarantor)`
 * into the concrete `CaseDocument` rows a client must collect.
 *
 * Re-running it is the normal case, not the exception: a client who swaps their
 * sponsor gets the new financial papers appended. Rows the client has already
 * worked on are never destroyed — only untouched, no-longer-matching rows are
 * soft-deleted (§7.1).
 */
@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every active rule whose conditions the context satisfies, in display order. */
  async matchingRules(stage: DocStage, context: ResolutionContext): Promise<RequirementRule[]> {
    return this.prisma.requirementRule.findMany({
      where: { stage, isActive: true, ...buildRuleWhere(context) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async resolveForCase(caseId: string, stage: DocStage): Promise<ResolutionSummary> {
    const gksCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { conditions: true, user: { select: { client: { select: { educationLevel: true } } } } },
    });
    if (!gksCase) throw new NotFoundException(`Case ${caseId} not found`);

    const context: ResolutionContext = {
      serviceType: gksCase.serviceType,
      // The case's own answer wins; the client record is the fallback for a case
      // whose conditions questionnaire has not been filled in yet (1D-06).
      educationLevel: gksCase.conditions?.educationLevel ?? gksCase.user.client?.educationLevel ?? null,
      guarantorType: gksCase.conditions?.guarantorType ?? GuarantorType.NONE,
      guarantorRelation: gksCase.conditions?.guarantorRelation ?? null,
      universityId: gksCase.universityId,
    };

    const rules = await this.matchingRules(stage, context);
    const existing = await this.prisma.caseDocument.findMany({ where: { caseId, stage } });
    const byTemplate = new Map(existing.map((doc) => [doc.templateId, doc]));

    const summary: ResolutionSummary = { stage, created: 0, updated: 0, removed: 0, keptDespiteUnmatched: 0 };
    const matchedTemplateIds = new Set<string>();

    for (const [index, rule] of rules.entries()) {
      // Two rules can name the same template (e.g. a school-specific override);
      // the first in sort order wins so the document appears once.
      if (matchedTemplateIds.has(rule.templateId)) continue;
      matchedTemplateIds.add(rule.templateId);

      const current = byTemplate.get(rule.templateId);
      const data = {
        ruleId: rule.id,
        necessity: rule.necessity,
        conditionNote: rule.conditionNote,
        sortOrder: index,
      };

      if (!current) {
        await this.prisma.caseDocument.create({ data: { caseId, templateId: rule.templateId, stage, ...data } });
        summary.created += 1;
      } else {
        await this.prisma.caseDocument.update({
          where: { id: current.id },
          // A row that had been dropped and is required again comes back with
          // whatever the client had already uploaded to it.
          data: { ...data, ...restorePatch() },
        });
        summary.updated += 1;
      }
    }

    for (const doc of existing) {
      if (matchedTemplateIds.has(doc.templateId) || doc.deletedAt) continue;
      if (doc.status === DocumentStatus.NOT_STARTED) {
        await this.prisma.caseDocument.update({ where: { id: doc.id }, data: softDeletePatch() });
        summary.removed += 1;
      } else {
        summary.keptDespiteUnmatched += 1;
      }
    }

    return summary;
  }
}

/**
 * An empty array on a rule means "applies to everyone" for that dimension, so
 * each filter is `isEmpty OR has(value)`. A context value of `null` (the client
 * has not answered yet) can only satisfy the `isEmpty` half.
 */
export function buildRuleWhere(context: ResolutionContext): Prisma.RequirementRuleWhereInput {
  const clauses: Prisma.RequirementRuleWhereInput[] = [
    { OR: [{ serviceTypes: { isEmpty: true } }, { serviceTypes: { has: context.serviceType } }] },
    { OR: [{ guarantorTypes: { isEmpty: true } }, { guarantorTypes: { has: context.guarantorType } }] },
    context.educationLevel === null
      ? { educationLevels: { isEmpty: true } }
      : { OR: [{ educationLevels: { isEmpty: true } }, { educationLevels: { has: context.educationLevel } }] },
    context.guarantorRelation === null
      ? { guarantorRelations: { isEmpty: true } }
      : { OR: [{ guarantorRelations: { isEmpty: true } }, { guarantorRelations: { has: context.guarantorRelation } }] },
    // A school-specific rule (1D-18) only fires for that school; a null rule is universal.
    context.universityId === null
      ? { universityId: null }
      : { OR: [{ universityId: null }, { universityId: context.universityId }] },
  ];

  return { AND: clauses };
}
