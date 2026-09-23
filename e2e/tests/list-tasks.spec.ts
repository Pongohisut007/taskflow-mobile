import { expect, test } from '@playwright/test';

test('GET /tasks lists tasks', async ({ request }) => {
  const created = await request.post('/tasks', {
    data: { title: `list-me ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  const res = await request.get('/tasks');
  expect(res.status()).toBe(200);

  const tasks = await res.json();
  expect(Array.isArray(tasks)).toBe(true);
  expect(tasks.map((t: { id: string }) => t.id)).toContain(id);
});
