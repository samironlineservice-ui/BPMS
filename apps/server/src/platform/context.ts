import { AsyncLocalStorage } from 'node:async_hooks';

export interface Actor {
  type: 'STAFF' | 'PORTAL_USER' | 'SYSTEM' | 'DEVICE' | 'GATEWAY' | 'API_KEY';
  id: string | null;
  label: string | null;
}
export interface RequestCtx {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  actor: Actor;
}

const als = new AsyncLocalStorage<RequestCtx>();
export const SYSTEM_ACTOR: Actor = { type: 'SYSTEM', id: null, label: 'system' };

export const requestContext = {
  enter(ctx: RequestCtx) {
    als.enterWith(ctx);
  },
  run<T>(ctx: RequestCtx, fn: () => T): T {
    return als.run(ctx, fn);
  },
  get(): RequestCtx {
    return als.getStore() ?? { requestId: 'system', ip: null, userAgent: null, actor: SYSTEM_ACTOR };
  },
  setActor(actor: Actor) {
    const s = als.getStore();
    if (s) s.actor = actor;
  },
};
