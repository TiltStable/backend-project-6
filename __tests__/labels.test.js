// @ts-check

import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import fastify from 'fastify';

import init from '../server/plugin.js';
import encrypt from '../server/lib/secure.js';
import { runMigrations } from '../server/db/index.js';
import { labels, tasks, taskStatuses, taskLabels, users } from '../server/db/schema.js';
import { getTestData, prepareData } from './helpers/index.js';

const jar = (response) =>
  Object.fromEntries(response.cookies.map(({ name, value }) => [name, value]));

const alertText = (body) => {
  const match = body.match(/<div[^>]*role="alert"[^>]*>([^<]*)<\/div>/);
  return match ? match[1] : null;
};

describe('test labels CRUD', () => {
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
    const consumed = await app.inject({
      method: 'GET',
      url: app.reverse('root'),
      cookies: jar(response),
    });
    expect(consumed.statusCode).toBe(200);
    return jar(consumed);
  };

  const findByName = async (name) => {
    const [row] = await app.db.select().from(labels).where(eq(labels.name, name));
    return row;
  };

  const createTaskWithLabel = async (label) => {
    const [status] = await app.db
      .insert(taskStatuses)
      .values({ name: faker.lorem.word() })
      .returning();
    const [creator] = await app.db
      .insert(users)
      .values({
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        passwordDigest: encrypt(faker.internet.password({ length: 12 })),
      })
      .returning();
    const [task] = await app.db
      .insert(tasks)
      .values({
        name: faker.lorem.words({ min: 2, max: 4 }),
        statusId: status.id,
        creatorId: creator.id,
      })
      .returning();
    await app.db.insert(taskLabels).values({ taskId: task.id, labelId: label.id });
    return task;
  };

  it('guest is redirected from every labels route', async () => {
    const routes = [
      { method: 'GET', url: app.reverse('labels') },
      { method: 'GET', url: app.reverse('newLabel') },
      { method: 'GET', url: app.reverse('editLabel', { id: 1 }) },
      { method: 'POST', url: app.reverse('labels'), payload: { data: { name: 'New' } } },
      {
        method: 'PATCH',
        url: app.reverse('updateLabel', { id: 1 }),
        payload: { data: { name: 'Updated' } },
      },
      { method: 'DELETE', url: app.reverse('deleteLabel', { id: 1 }) },
    ];
    for (const route of routes) {
      // eslint-disable-next-line no-await-in-loop
      const response = await app.inject(route);
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
    }
    const rows = await app.db.select().from(labels);
    expect(rows).toHaveLength(0);
  });

  it('index shows labels for a signed-in user', async () => {
    const cookie = await signIn();
    await app.db.insert(labels).values({ name: 'Important' });
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('labels'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/<h1[^>]*>Labels<\/h1>/);
    expect(response.body).toContain('Important');
    expect(response.body).toContain('Create label');
  });

  it('new renders the creation form', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('newLabel'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('name="data[name]"');
    expect(response.body).toMatch(/type="submit"\s+value="Save"/);
  });

  it('create succeeds', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('labels'),
      cookies: cookie,
      payload: { data: { name } },
    });

    expect(response.statusCode).toBe(302);
    expect(await findByName(name)).toMatchObject({ name });
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('labels'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Label successfully created');
  });

  it('create rejects an empty name', async () => {
    const cookie = await signIn();
    const before = await app.db.select().from(labels);
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('labels'),
      cookies: cookie,
      payload: { data: { name: '' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
    expect(alertText(response.body)).toBe('Failed to create label');
    const after = await app.db.select().from(labels);
    expect(after).toHaveLength(before.length);
  });

  it('edit renders the prefilled form', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(labels).values({ name });
    const { id } = await findByName(name);
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('editLabel', { id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`value="${name}"`);
    expect(response.body).toContain('value="patch"');
  });

  it('update changes the name', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(labels).values({ name });
    const { id } = await findByName(name);
    const newName = faker.lorem.word();
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateLabel', { id }),
      cookies: cookie,
      payload: { data: { name: newName } },
    });

    expect(response.statusCode).toBe(302);
    expect(await findByName(name)).toBeUndefined();
    expect(await findByName(newName)).toMatchObject({ name: newName });
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('labels'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Label has been updated');
  });

  it('update rejects an empty name without changing the row', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(labels).values({ name });
    const { id } = await findByName(name);
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateLabel', { id }),
      cookies: cookie,
      payload: { data: { name: '' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
    expect(await findByName(name)).toMatchObject({ name });
  });

  it('delete removes an unrelated label', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(labels).values({ name });
    const { id } = await findByName(name);
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteLabel', { id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    expect(await findByName(name)).toBeUndefined();
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('labels'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Label has been deleted');
  });

  it('delete is blocked for a label used by a task', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(labels).values({ name });
    const label = await findByName(name);
    await createTaskWithLabel(label);
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteLabel', { id: label.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('labels'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Label is used in tasks');
    expect(await findByName(name)).toMatchObject({ name });
  });

  it('edit responds 404 for unknown and garbage ids', async () => {
    const cookie = await signIn();

    const missing = await app.inject({
      method: 'GET',
      url: app.reverse('editLabel', { id: 99999 }),
      cookies: cookie,
    });
    expect(missing.statusCode).toBe(404);

    const notANumber = await app.inject({
      method: 'GET',
      url: '/labels/abc/edit',
      cookies: cookie,
    });
    expect(notANumber.statusCode).toBe(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
