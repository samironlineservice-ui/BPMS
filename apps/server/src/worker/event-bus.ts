import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEvent } from '@ads/db';

export type EventHandler = (e: OutboxEvent) => Promise<void>;

/** Jarayon ichidagi event bus: outbox relay e'lon qiladi, modullar (bildirishnomalar va h.k.) obuna bo'ladi. */
@Injectable()
export class EventBus {
  private readonly log = new Logger('EventBus');
  private readonly handlers: { pattern: RegExp; name: string; fn: EventHandler }[] = [];

  on(pattern: string | RegExp, name: string, fn: EventHandler) {
    this.handlers.push({ pattern: typeof pattern === 'string' ? new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`) : pattern, name, fn });
  }

  /** Har handler alohida; xato boshqalarini to'xtatmaydi. Qaytaradi: muvaffaqiyatsiz handler nomlari. */
  async publish(e: OutboxEvent): Promise<string[]> {
    const failed: string[] = [];
    for (const h of this.handlers) {
      if (!h.pattern.test(e.type)) continue;
      try { await h.fn(e); } catch (err) {
        failed.push(h.name);
        this.log.error(`${h.name} ← ${e.type}: ${(err as Error).message}`);
      }
    }
    return failed;
  }
}
