import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((dto: Partial<Task>) => ({ ...dto }) as Task),
    save: jest.fn((task: Task) => Promise.resolve(task)),
    remove: jest.fn(),
  };

  const task = (overrides: Partial<Task> = {}): Task =>
    ({ id: 'id-1', title: 'Write tests', done: false, ...overrides }) as Task;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: repo },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  it('findAll returns tasks newest first', async () => {
    repo.find.mockResolvedValue([task()]);

    await expect(service.findAll()).resolves.toEqual([task()]);
    expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
  });

  it('findOne returns the task', async () => {
    repo.findOne.mockResolvedValue(task());

    await expect(service.findOne('id-1')).resolves.toEqual(task());
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'id-1' } });
  });

  it('findOne throws when the task does not exist', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create saves a new task', async () => {
    await expect(service.create({ title: 'New' })).resolves.toEqual({
      title: 'New',
    });
    expect(repo.create).toHaveBeenCalledWith({ title: 'New' });
    expect(repo.save).toHaveBeenCalled();
  });

  it('update merges fields but keeps the id', async () => {
    repo.findOne.mockResolvedValue(task());

    await expect(service.update('id-1', { title: 'Renamed' })).resolves.toEqual(
      task({ title: 'Renamed' }),
    );
  });

  it('markDone sets done to true', async () => {
    repo.findOne.mockResolvedValue(task());

    await expect(service.markDone('id-1')).resolves.toEqual(
      task({ done: true }),
    );
  });

  it('remove deletes the task', async () => {
    repo.findOne.mockResolvedValue(task());

    await service.remove('id-1');
    expect(repo.remove).toHaveBeenCalledWith(task());
  });
});
