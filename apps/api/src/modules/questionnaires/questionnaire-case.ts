import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { suggestQuestionnaireLevel } from './questionnaire-level.js';

/** What both questionnaire services need to know about the case before anything else. */
export interface QuestionnaireCase {
  id: string;
  userId: string;
  applicantName: string;
  suggestedLevel: ReturnType<typeof suggestQuestionnaireLevel>;
}

/**
 * Loads a case the actor may work on, and refuses one that is not GKS: the
 * essay and recommendation questionnaires are the scholarship's paperwork
 * (gksedu.md §4.3), not ordinary admission's.
 */
export async function loadQuestionnaireCase(
  prisma: PrismaService,
  caseId: string,
  actor: AuthenticatedUser,
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
  if (found.serviceType !== ServiceType.GKS_SCHOLARSHIP) {
    throw new BadRequestException('Эссэ ба тодорхойлолтын асуулга зөвхөн GKS тэтгэлгийн үйлчилгээнд байдаг');
  }

  const client = found.user.client;
  return {
    id: found.id,
    userId: found.userId,
    applicantName: client ? `${client.lastName} ${client.firstName}` : (found.user.name ?? ''),
    suggestedLevel: suggestQuestionnaireLevel({
      programLevel: found.program?.level,
      intakeLevel: found.intake?.level,
      educationLevel: found.conditions?.educationLevel,
    }),
  };
}
