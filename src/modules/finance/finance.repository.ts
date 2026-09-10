import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;
@Injectable()
export class FinanceRepository {
  constructor(readonly db: PrismaService) {}
  async transaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(operation, {
          isolationLevel: 'Serializable',
          timeout: 20000,
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (attempt >= 3 || (code !== 'P2034' && code !== 'P2002')) throw error;
      }
    }
  }
}

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}
export async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  reference: string,
  metadata: unknown = {},
) {
  await tx.auditLog.create({ data: { actorId, action, reference, metadata: json(metadata) } });
}
