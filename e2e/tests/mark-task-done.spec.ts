import { expect, test } from '@playwright/test';

test('PATCH /tasks/:id/done marks a task done', async ({ request }) => {
  const created = await request.post('/tasks', {
    data: { title: `finish-me ${Date.now()}` },
  });
  const { id } = await created.json();

  const res = await request.patch(`/tasks/${id}/done`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ id, done: true });

  const fetched = await request.get(`/tasks/${id}`);
  expect(await fetched.json()).toMatchObject({ id, done: true });
});
