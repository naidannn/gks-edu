import type { Prisma } from '../../prisma/client.js';

/**
 * What a contract may say to the person who signed it (1N-04).
 *
 * `physicalScanPath` and `signedIp` are the office's audit trail, not the
 * client's copy. `pdfPath` is selected but never returned: the portal only
 * needs to know the archived PDF exists — it downloads it through a signed
 * token — so {@link toClientContract} turns the storage path into `hasPdf`.
 */
export const CLIENT_CONTRACT_SELECT = {
  id: true,
  caseId: true,
  userId: true,
  number: true,
  type: true,
  status: true,
  totalAmountSnapshot: true,
  prepaymentModeSnapshot: true,
  prepaymentValueSnapshot: true,
  balanceTriggerSnapshot: true,
  refundPolicy: true,
  bodyMn: true,
  pdfPath: true,
  sentAt: true,
  acceptedAt: true,
  otpVerifiedAt: true,
  signedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContractSelect;

/** Always paired with {@link CLIENT_CONTRACT_SELECT} — the select alone still carries `pdfPath`. */
export function toClientContract<T extends { pdfPath: string | null }>(contract: T): Omit<T, 'pdfPath'> & { hasPdf: boolean } {
  const { pdfPath, ...rest } = contract;
  return { ...rest, hasPdf: Boolean(pdfPath) };
}
