import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  const service = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'id-1' }),
    create: jest.fn().mockResolvedValue({ id: 'id-1' }),
    update: jest.fn().mockResolvedValue({ id: 'id-1' }),
    markDone: jest.fn().mockResolvedValue({ id: 'id-1', done: true }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: service }],
    }).compile();

    controller = module.get(TasksController);
  });

  it('delegates every route to the service', async () => {
    await controller.findAll();
    await controller.findOne('id-1');
    await controller.create({ title: 'New' });
    await controller.update('id-1', { title: 'Renamed' });
    await controller.markDone('id-1');
    await controller.remove('id-1');

    expect(service.findAll).toHaveBeenCalled();
    expect(service.findOne).toHaveBeenCalledWith('id-1');
    expect(service.create).toHaveBeenCalledWith({ title: 'New' });
    expect(service.update).toHaveBeenCalledWith('id-1', { title: 'Renamed' });
    expect(service.markDone).toHaveBeenCalledWith('id-1');
    expect(service.remove).toHaveBeenCalledWith('id-1');
  });
});
