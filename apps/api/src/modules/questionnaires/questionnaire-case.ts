import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EssayLevel, EssayTrack } from './definitions/index.js';
import { suggestQuestionnaireLevel } from './questionnaire-level.js';

/** What both questionnaire services need to know about the case before anything else. */
export interface QuestionnaireCase {
  id: string;
  userId: string;
  applicantName: string;
  track: EssayTrack;
  suggestedLevel: EssayLevel | null;
  /**
   * The level a regular case is bound to — its service *is* the level, so the
   * client is never asked. Null for GKS, where the client picks.
   */
  fixedLevel: EssayLevel | null;
}

/** Ordinary admission's services, each of which is its own level. */
const REGULAR_LEVELS: Partial<Record<ServiceType, EssayLevel>> = {
  [ServiceType.LANGUAGE_PREP]: 'LANGUAGE_PREP',
  [ServiceType.BACHELOR]: 'BACHELOR',
  [ServiceType.MASTER]: 'MASTER',
  [ServiceType.PHD]: 'PHD',
};

/**
 * Loads a case the actor may work on. A GKS case gets the scholarship's essay
 * questionnaire and teachers' letters (gksedu.md §4.3); every other case gets
 * ordinary admission's essay questionnaire for its level (1D-33) and no letters.
 */
export async function loadQuestionnaireCase(
  prisma: PrismaService,
  caseId: string,
  actor: AuthenticatedUser,
  options: { gksOnly?: boolean } = {},
): Promise<QuestionnaireCase> {
  const found = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      userId: true,
      serviceType: true,
      program: { select: { level: true } },
      intake: { select: { level: true } },
      conditions: { select: { educationLevel: true } },
      user: { select: { name: true, client: { select: { lastName: true, firstName: true } } } },
    },
  });
  if (!found) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);
  if (!isStaff(actor.role) && found.userId !== actor.id) {
    throw new ForbiddenException('Энэ үйлчилгээнд хандах эрхгүй байна');
  }

  const isGks = found.serviceType === ServiceType.GKS_SCHOLARSHIP;
  const fixedLevel = REGULAR_LEVELS[found.serviceType] ?? null;
  if (options.gksOnly && !isGks) {
    throw new BadRequestException('Багшийн тодорхойлолтын асуулга зөвхөн GKS тэтгэлгийн үйлчилгээнд байдаг');
  }

  const client = found.user.client;
  return {
    id: found.id,
    userId: found.userId,
    applicantName: client ? `${client.lastName} ${client.firstName}` : (found.user.name ?? ''),
    track: isGks ? 'GKS' : 'REGULAR',
    fixedLevel,
    suggestedLevel:
      fixedLevel ??
      suggestQuestionnaireLevel({
        programLevel: found.program?.level,
        intakeLevel: found.intake?.level,
        educationLevel: found.conditions?.educationLevel,
      }),
  };
}
