import { ConflictException, Injectable } from '@nestjs/common';
import type { Tx } from './finance.repository.js';

@Injectable()
export class WalletService {
  async post(
    tx: Tx,
    input: {
      userId: string;
      key: string;
      type: string;
      available: bigint;
      reserved: bigint;
      reference: string;
      actorId?: string;
      reason?: string;
      requireFunds?: bigint;
    },
  ) {
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: input.key },
      include: { wallet: true },
    });
    if (existing) {
      if (
        existing.wallet.userId !== input.userId ||
        existing.availableDelta !== input.available ||
        existing.reservedDelta !== input.reserved ||
        existing.reference !== input.reference
      )
        throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
      return existing;
    }
    const wallet = await tx.wallet.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId },
      update: {},
    });
    if (input.requireFunds !== undefined && wallet.available < input.requireFunds)
      throw new ConflictException('INSUFFICIENT_AVAILABLE_BALANCE');
    if (wallet.reserved + input.reserved < 0n)
      throw new ConflictException('INVALID_RESERVED_BALANCE');
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        available: { increment: input.available },
        reserved: { increment: input.reserved },
      },
    });
    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        idempotencyKey: input.key,
        type: input.type,
        availableDelta: input.available,
        reservedDelta: input.reserved,
        availableAfter: updated.available,
        reservedAfter: updated.reserved,
        reference: input.reference,
        createdBy: input.actorId,
        reason: input.reason,
      },
    });
  }
}
