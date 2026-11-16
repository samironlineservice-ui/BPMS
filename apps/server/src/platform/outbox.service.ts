import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ads/db';
import { requestContext } from './context.js';
import type { DbOrTx } from './db.service.js';

export interface DomainEvent {
  type: string;
  /** dedupe kaliti: "invoice.finalized:<id>" */
  eventKey: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxService {
  /** Event biznes o'zgarish bilan bitta tranzaksiyada yoziladi; worker relay qiladi. */
  async add(db: DbOrTx, e: DomainEvent) {
    await db.outboxEvent.createMany({
      data: [{
        type: e.type,
        eventKey: e.eventKey,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        payload: JSON.parse(JSON.stringify(e.payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Prisma.InputJsonValue,
        correlationId: requestContext.get().requestId,
      }],
      skipDuplicates: true,
    });
  }
}
