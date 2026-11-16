import path from 'node:path';
import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
} catch {
  /* CI'da .env bo'lmasligi mumkin */
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL_MIGRATOR ?? '' },
});
