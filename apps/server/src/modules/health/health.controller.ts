import { Controller, Get } from '@nestjs/common';
import { Public } from '../../platform/auth/decorators.js';
import { Db } from '../../platform/db.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok' };
  }
}
