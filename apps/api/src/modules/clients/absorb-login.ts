import { ConflictException } from '@nestjs/common';
import { Role } from '../../prisma/client.js';
import type { Prisma, PrismaClient } from '../../prisma/client.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** The login a client opened on the site themselves, found under the address staff just typed. */
export interface LoginToAbsorb {
  id: string;
  password: string | null;
  googleId: string | null;
}

/**
 * Staff typed a client's address wrong at registration — the invitation
 * bounced — and the client, never hearing from us, signed up on the site with
 * the right one. Now there are two accounts: the office's, which owns the case
 * and the contract but can never be logged into, and the client's, which they
 * log into and which owns nothing. The cabinet shows an empty page (KH-2026-0009).
 *
 * Correcting the address on the client card is the moment staff find out, so
 * that edit resolves it: the self-registered account's login moves onto the
 * client's account, and the empty one is removed. 1B-20 covers the other order,
 * where the site account existed before the office registered the person.
 *
 * Everything else stays a 409, because every other shape loses something if it
 * is merged silently: an address on another client or on staff is a genuine
 * clash, a site account that already carries a case or a contract is a second
 * client in all but name, and a client account that can already log in would
 * leave the person with one of two passwords and no way to know which.
 */
export async function findLoginToAbsorb(
  db: Db,
  email: string,
  own: { id: string; password: string | null; googleId: string | null },
): Promise<LoginToAbsorb | null> {
  const other = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      password: true,
      googleId: true,
      client: { select: { code: true } },
      _count: { select: { cases: true, contracts: true } },
    },
  });
  if (!other || other.id === own.id) return null;

  if (other.client) {
    throw new ConflictException(`Энэ имэйлээр ${other.client.code} үйлчлүүлэгч бүртгэлтэй байна`);
  }
  if (other.role !== Role.USER) {
    throw new ConflictException('Энэ имэйл ажилтны бүртгэлд ашиглагдаж байна');
  }
  if (other._count.cases > 0 || other._count.contracts > 0) {
    throw new ConflictException('Энэ имэйлтэй бүртгэл дээр өөр үйлчилгээ, гэрээ байна — автоматаар нэгтгэх боломжгүй');
  }
  if (own.password || own.googleId) {
    throw new ConflictException(
      'Энэ хэрэглэгч өөрийн нэвтрэх эрхтэй, энэ имэйлээр бас тусдаа бүртгэл байна — хоёуланг нь автоматаар нэгтгэх боломжгүй',
    );
  }

  return { id: other.id, password: other.password, googleId: other.googleId };
}

/**
 * Moves everything the self-registered account accumulated onto the client's
 * account, deletes it, and gives the client's account its credentials and
 * address. Runs inside the caller's transaction: the delete frees the unique
 * email the final update takes.
 */
export async function absorbLogin(tx: Prisma.TransactionClient, keepId: string, drop: LoginToAbsorb, email: string) {
  const from = { userId: drop.id };

  // Two unique keys: where both accounts hold the same row, the client's own
  // choices (made on the account they actually use) win.
  const saved = await tx.savedUniversity.findMany({ where: from, select: { universityId: true } });
  await tx.savedUniversity.deleteMany({
    where: { userId: keepId, universityId: { in: saved.map((row) => row.universityId) } },
  });
  const prefs = await tx.notificationPreference.findMany({ where: from, select: { channel: true } });
  await tx.notificationPreference.deleteMany({
    where: { userId: keepId, channel: { in: prefs.map((row) => row.channel) } },
  });

  // One connection underneath an interactive transaction — sequential on purpose.
  await tx.savedUniversity.updateMany({ where: from, data: { userId: keepId } });
  await tx.notificationPreference.updateMany({ where: from, data: { userId: keepId } });
  await tx.notification.updateMany({ where: from, data: { userId: keepId } });
  await tx.lead.updateMany({ where: from, data: { userId: keepId } });
  await tx.chatSession.updateMany({ where: from, data: { userId: keepId } });
  await tx.conversation.updateMany({ where: { clientUserId: drop.id }, data: { clientUserId: keepId } });
  await tx.message.updateMany({ where: { senderId: drop.id }, data: { senderId: keepId } });
  await tx.leadActivity.updateMany({ where: { actorId: drop.id }, data: { actorId: keepId } });
  await tx.auditLog.updateMany({ where: { actorId: drop.id }, data: { actorId: keepId } });
  // Its sessions carry the old id in the JWT; the client signs in once more.
  await tx.refreshToken.deleteMany({ where: from });

  await tx.user.delete({ where: { id: drop.id } });
  await tx.user.update({
    where: { id: keepId },
    data: {
      email,
      password: drop.password,
      googleId: drop.googleId,
      claimedAt: new Date(),
      claimTokenHash: null,
      claimTokenExpiresAt: null,
    },
  });
}
