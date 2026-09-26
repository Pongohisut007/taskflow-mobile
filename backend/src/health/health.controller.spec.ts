import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    dataSource.query.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns ok when the database answers', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('throws 503 when the database is unreachable', async () => {
    dataSource.query.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reports unhealthy when HEALTH_FORCE_FAIL is set', async () => {
    process.env.HEALTH_FORCE_FAIL = 'true';
    try {
      await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(dataSource.query).not.toHaveBeenCalled();
    } finally {
      delete process.env.HEALTH_FORCE_FAIL;
    }
  });
});
