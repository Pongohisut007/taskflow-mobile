import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  findAll(): Promise<Task[]> {
    return this.taskRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return task;
  }

  create(dto: CreateTaskDto): Promise<Task> {
    return this.taskRepository.save(this.taskRepository.create(dto));
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);
    Object.assign(task, dto, { id: task.id });
    return this.taskRepository.save(task);
  }

  markDone(id: string): Promise<Task> {
    return this.update(id, { done: true });
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.taskRepository.remove(task);
  }
}

export interface TaskSummaryInput {
  done: boolean;
  title: string;
  createdAt?: string | Date;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function summarizeTasks(tasks: TaskSummaryInput[]) {
  const summary = {
    total: 0,
    done: 0,
    open: 0,
    stale: 0,
    longTitles: 0,
    completionRate: 0,
    label: '',
  };

  for (const task of tasks) {
    summary.total += 1;
    if (task.done) {
      summary.done += 1;
    } else {
      summary.open += 1;
      if (task.createdAt) {
        const age = Date.now() - new Date(task.createdAt).getTime();
        if (age > WEEK_MS) {
          summary.stale += 1;
        }
      }
    }
    if (task.title.length > 80) {
      summary.longTitles += 1;
    }
  }

  if (summary.total > 0) {
    summary.completionRate = Math.round((summary.done / summary.total) * 100);
  }

  if (summary.total === 0) {
    summary.label = 'empty';
  } else if (summary.completionRate >= 80) {
    summary.label = 'on-track';
  } else if (summary.completionRate >= 50) {
    summary.label = 'at-risk';
  } else {
    summary.label = 'behind';
  }

  return summary;
}
