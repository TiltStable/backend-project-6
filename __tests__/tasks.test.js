// @ts-check

import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import fastify from 'fastify';

import init from '../server/plugin.js';
import encrypt from '../server/lib/secure.js';
import { runMigrations } from '../server/db/index.js';
import { tasks, taskStatuses, users } from '../server/db/schema.js';
import { getTestData, prepareData } from './helpers/index.js';

const jar = (response) =>
  Object.fromEntries(response.cookies.map(({ name, value }) => [name, value]));

const alertText = (body) => {
  const match = body.match(/<div[^>]*role="alert"[^>]*>([^<]*)<\/div>/);
  return match ? match[1] : null;
};

const formBody = (fields) => new URLSearchParams(fields).toString();
const urlEncoded = { 'content-type': 'application/x-www-form-urlencoded' };

describe('test tasks CRUD', () => {
  let app;
  const testData = getTestData();

  beforeAll(async () => {
    app = fastify({
      exposeHeadRoutes: false,
      logger: { target: 'pino-pretty' },
    });
    await init(app);
    await runMigrations(app.db);
    await prepareData(app);
  });

  const signIn = async () => {
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('session'),
      payload: { data: testData.users.existing },
    });
    expect(response.statusCode).toBe(302);
    // Consume the sign-in flash: the session lives in the cookie, so the
    // updated cookie from this request must be used afterwards.
    const consumed = await app.inject({
      method: 'GET',
      url: app.reverse('root'),
      cookies: jar(response),
    });
    expect(consumed.statusCode).toBe(200);
    return jar(consumed);
  };

  const createStatusViaDb = async (name = faker.lorem.word()) => {
    const [status] = await app.db.insert(taskStatuses).values({ name }).returning();
    return status;
  };

  const createUserViaDb = async () => {
    const [user] = await app.db
      .insert(users)
      .values({
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        passwordDigest: encrypt(faker.internet.password({ length: 12 })),
      })
      .returning();
    return user;
  };

  const createTaskViaDb = async (overrides = {}) => {
    const status = overrides.status ?? (await createStatusViaDb());
    const creator = overrides.creator ?? (await createUserViaDb());
    const [task] = await app.db
      .insert(tasks)
      .values({
        name: faker.lorem.words({ min: 2, max: 4 }),
        description: faker.lorem.sentence(),
        statusId: status.id,
        creatorId: creator.id,
        ...overrides,
      })
      .returning();
    return task;
  };

  it('guest is redirected from every tasks route', async () => {
    const routes = [
      { method: 'GET', url: app.reverse('tasks') },
      { method: 'GET', url: app.reverse('newTask') },
      { method: 'GET', url: app.reverse('showTask', { id: 1 }) },
      { method: 'GET', url: app.reverse('editTask', { id: 1 }) },
      {
        method: 'POST',
        url: app.reverse('tasks'),
        payload: { data: { name: 'New', statusId: '1' } },
      },
      {
        method: 'PATCH',
        url: app.reverse('updateTask', { id: 1 }),
        payload: { data: { name: 'Updated', statusId: '1' } },
      },
      { method: 'DELETE', url: app.reverse('deleteTask', { id: 1 }) },
    ];
    for (const route of routes) {
      // eslint-disable-next-line no-await-in-loop
      const response = await app.inject(route);
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
    }
    const rows = await app.db.select().from(tasks);
    expect(rows).toHaveLength(0);
  });

  it('index shows tasks with the newest first', async () => {
    const cookie = await signIn();
    const older = await createTaskViaDb();
    const newer = await createTaskViaDb();
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('tasks'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/<h1[^>]*>Tasks<\/h1>/);
    expect(response.body).toContain('Create task');
    // Name links are the only /tasks/:id hrefs in the list markup.
    const hrefIds = [...response.body.matchAll(/href="\/tasks\/(\d+)"/g)].map((m) => Number(m[1]));
    expect(hrefIds.indexOf(newer.id)).toBeLessThan(hrefIds.indexOf(older.id));
  });

  it('index shows the delete button only on own tasks', async () => {
    const cookie = await signIn();
    const [me] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, testData.users.existing.email));
    const mine = await createTaskViaDb({ creatorId: me.id });
    const theirs = await createTaskViaDb();
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('tasks'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`action="${app.reverse('deleteTask', { id: mine.id })}"`);
    expect(response.body).not.toContain(`action="${app.reverse('deleteTask', { id: theirs.id })}"`);
    // Editing is allowed for every signed-in user.
    expect(response.body).toContain(app.reverse('editTask', { id: theirs.id }));
  });

  it('new renders the creation form', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('newTask'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('name="data[name]"');
    expect(response.body).toContain('name="data[description]"');
    expect(response.body).toContain('<textarea');
    expect(response.body).toContain('name="data[statusId]"');
    expect(response.body).toContain('name="data[executorId]"');
    expect(response.body).toContain(`value="${status.id}"`);
  });

  it('create succeeds without an executor', async () => {
    const cookie = await signIn();
    const [me] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, testData.users.existing.email));
    const status = await createStatusViaDb();
    const params = {
      name: faker.lorem.words({ min: 2, max: 4 }),
      description: faker.lorem.sentence(),
      statusId: String(status.id),
    };
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: { data: params },
    });

    expect(response.statusCode).toBe(302);
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('tasks'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Task successfully created');

    const rows = await app.db.select().from(tasks);
    const row = rows.find((item) => item.name === params.name);
    expect(row).toMatchObject({
      description: params.description,
      statusId: status.id,
      creatorId: me.id,
      executorId: null,
    });
  });

  it('create succeeds with an executor', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const executor = await createUserViaDb();
    const params = {
      name: faker.lorem.words({ min: 2, max: 4 }),
      statusId: String(status.id),
      executorId: String(executor.id),
    };
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: { data: params },
    });

    expect(response.statusCode).toBe(302);
    const rows = await app.db.select().from(tasks);
    const row = rows.find((item) => item.name === params.name);
    expect(row).toMatchObject({ statusId: status.id, executorId: executor.id });
  });

  it('create rejects an empty name', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const before = await app.db.select().from(tasks);
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: { data: { name: '', statusId: String(status.id) } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
    expect(alertText(response.body)).toBe('Failed to create task');
    const after = await app.db.select().from(tasks);
    expect(after).toHaveLength(before.length);
  });

  it('create rejects a missing status', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: { data: { name: 'Whatever' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
  });

  it('create rejects an unknown status', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: { data: { name: 'Whatever', statusId: '999' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must be an existing status');
  });

  it('create rejects an unknown executor', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: {
        data: { name: 'Whatever', statusId: String(status.id), executorId: '999' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must be an existing user');
  });

  it('create rejects a non-numeric status without a server error', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: { data: { name: 'Whatever', statusId: 'abc' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must be an existing status');
  });

  it('create rejects a non-numeric executor without a server error', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('tasks'),
      cookies: cookie,
      payload: {
        data: { name: 'Whatever', statusId: String(status.id), executorId: 'xyz' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must be an existing user');
  });

  it('show renders the task page', async () => {
    const cookie = await signIn();
    const creator = await createUserViaDb();
    const executor = await createUserViaDb();
    const status = await createStatusViaDb('Ready');
    const task = await createTaskViaDb({
      creatorId: creator.id,
      executorId: executor.id,
      statusId: status.id,
    });
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('showTask', { id: task.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(task.name);
    expect(response.body).toContain(task.description);
    expect(response.body).toContain('Ready');
    expect(response.body).toContain(creator.firstName);
    expect(response.body).toContain(executor.firstName);
    expect(response.body).toContain(app.reverse('editTask', { id: task.id }));
  });

  it('show responds 404 for unknown and garbage ids', async () => {
    const cookie = await signIn();

    const missing = await app.inject({
      method: 'GET',
      url: app.reverse('showTask', { id: 99999 }),
      cookies: cookie,
    });
    expect(missing.statusCode).toBe(404);

    const notANumber = await app.inject({
      method: 'GET',
      url: '/tasks/abc',
      cookies: cookie,
    });
    expect(notANumber.statusCode).toBe(404);
  });

  it('edit renders the prefilled form', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const executor = await createUserViaDb();
    const task = await createTaskViaDb({ statusId: status.id, executorId: executor.id });
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('editTask', { id: task.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`value="${task.name}"`);
    expect(response.body).toContain(task.description);
    expect(response.body).toContain(`<option value="${status.id}" selected>`);
    expect(response.body).toContain(`<option value="${executor.id}" selected>`);
    expect(response.body).toContain('value="patch"');
  });

  it('edit responds 404 for an unknown id', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('editTask', { id: 99999 }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(404);
  });

  it('update changes the task without touching the creator', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const task = await createTaskViaDb({ statusId: status.id });
    const newStatus = await createStatusViaDb();
    const executor = await createUserViaDb();
    const params = {
      name: faker.lorem.words({ min: 2, max: 4 }),
      description: faker.lorem.sentence(),
      statusId: String(newStatus.id),
      executorId: String(executor.id),
    };
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateTask', { id: task.id }),
      cookies: cookie,
      payload: { data: params },
    });

    expect(response.statusCode).toBe(302);
    const [row] = await app.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row).toMatchObject({
      name: params.name,
      description: params.description,
      statusId: newStatus.id,
      executorId: executor.id,
      creatorId: task.creatorId,
    });
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('tasks'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Task has been updated');
  });

  it('update rejects an empty name without changing the row', async () => {
    const cookie = await signIn();
    const task = await createTaskViaDb();
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateTask', { id: task.id }),
      cookies: cookie,
      payload: { data: { name: '', statusId: String(task.statusId) } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
    const [row] = await app.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row).toMatchObject({ name: task.name });
  });

  it('update responds 404 for an unknown id', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateTask', { id: 99999 }),
      cookies: cookie,
      payload: { data: { name: 'Whatever', statusId: '1' } },
    });

    expect(response.statusCode).toBe(404);
  });

  it('delete is denied for a non-creator', async () => {
    const cookie = await signIn();
    const task = await createTaskViaDb(); // creator is another user
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteTask', { id: task.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('tasks'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('You are not allowed to perform this action');
    const rows = await app.db.select().from(tasks);
    expect(rows.find((item) => item.id === task.id)).toBeDefined();
  });

  it('delete succeeds for the creator', async () => {
    const cookie = await signIn();
    const [me] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, testData.users.existing.email));
    const task = await createTaskViaDb({ creatorId: me.id });
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteTask', { id: task.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    const rows = await app.db.select().from(tasks);
    expect(rows.find((row) => row.id === task.id)).toBeUndefined();
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('tasks'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Task has been deleted');
  });

  it('delete responds 404 for an unknown id', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteTask', { id: 99999 }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(404);
  });

  it('patch via form method override updates the task', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const task = await createTaskViaDb({ statusId: status.id });
    const newName = faker.lorem.words({ min: 2, max: 4 });
    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}`,
      cookies: cookie,
      payload: formBody({
        'data[name]': newName,
        'data[description]': '',
        'data[statusId]': String(task.statusId),
        'data[executorId]': '',
        _method: 'patch',
      }),
      headers: urlEncoded,
    });

    expect(response.statusCode).toBe(302);
    const [row] = await app.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row).toMatchObject({ name: newName, executorId: null });
  });

  it('delete via form method override removes the task', async () => {
    const cookie = await signIn();
    const [me] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, testData.users.existing.email));
    const task = await createTaskViaDb({ creatorId: me.id });
    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}`,
      cookies: cookie,
      payload: formBody({ _method: 'delete' }),
      headers: urlEncoded,
    });

    expect(response.statusCode).toBe(302);
    const rows = await app.db.select().from(tasks);
    expect(rows.find((row) => row.id === task.id)).toBeUndefined();
  });

  it('a user related to a task as creator cannot be deleted', async () => {
    const cookie = await signIn();
    const [me] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, testData.users.existing.email));
    await createTaskViaDb({ creatorId: me.id });
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteUser', { id: me.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('users'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('User has related tasks');
    const rows = await app.db.select().from(tasks);
    expect(rows.find((item) => item.creatorId === me.id)).toBeDefined();
    const meStillThere = await app.db
      .select()
      .from(users)
      .where(eq(users.email, testData.users.existing.email));
    expect(meStillThere).toHaveLength(1);
  });

  it('a user related to a task as executor cannot be deleted', async () => {
    const cookie = await signIn();
    const [me] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, testData.users.existing.email));
    await createTaskViaDb({ executorId: me.id });
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteUser', { id: me.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('users'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('User has related tasks');
  });

  it('a status related to a task cannot be deleted', async () => {
    const cookie = await signIn();
    const status = await createStatusViaDb();
    const task = await createTaskViaDb({ statusId: status.id });
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteStatus', { id: status.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('statuses'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Status is used in tasks');
    const rows = await app.db.select().from(tasks);
    expect(rows.find((row) => row.id === task.id)).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
