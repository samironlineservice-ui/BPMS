import { Injectable } from '@nestjs/common';
import { Db } from '../db.service.js';

interface CacheEntry { perms: Set<string>; roles: { key: string; name: string; expiresAt: Date | null }[]; at: number; }

/** Foydalanuvchining effektiv ruxsatlari (GLOBAL scope, muddati o'tmagan rollar). 30 s kesh. */
@Injectable()
export class PermissionService {
  private cache = new Map<string, CacheEntry>();
  constructor(private readonly db: Db) {}

  async load(userId: string): Promise<CacheEntry> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < 30_000) return hit;
    const now = new Date();
    const rows = await this.db.userRoleAssignment.findMany({
      where: { userId, scopeType: 'GLOBAL', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: { role: { include: { permissions: true } } },
    });
    const entry: CacheEntry = {
      perms: new Set(rows.flatMap((r) => r.role.permissions.map((p) => p.permissionKey))),
      roles: rows.map((r) => ({ key: r.role.key, name: r.role.name, expiresAt: r.expiresAt })),
      at: Date.now(),
    };
    this.cache.set(userId, entry);
    return entry;
  }
  invalidate(userId?: string) {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}
