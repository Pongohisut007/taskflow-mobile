import { expect, test } from '@playwright/test';

test('POST /tasks creates a task', async ({ request }) => {
  const title = `create-me ${Date.now()}`;

  const res = await request.post('/tasks', { data: { title } });
  expect(res.status()).toBe(201);

  const task = await res.json();
  expect(task).toMatchObject({ title, done: false });
  expect(task.id).toEqual(expect.any(String));

  const fetched = await request.get(`/tasks/${task.id}`);
  expect(await fetched.json()).toMatchObject({ id: task.id, title });
});

test('POST /tasks rejects an empty title', async ({ request }) => {
  const res = await request.post('/tasks', { data: { title: '' } });
  expect(res.status()).toBe(400);
});
