import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    // Lab 07 rollback demo: an image built with HEALTH_FORCE_FAIL=true reports unhealthy.
    if (process.env.HEALTH_FORCE_FAIL === 'true') {
      throw new ServiceUnavailableException({ status: 'forced_failure' });
    }
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
  }
}
