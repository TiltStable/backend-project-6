// @ts-check

import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import fastify from 'fastify';

import init from '../server/plugin.js';
import { runMigrations } from '../server/db/index.js';
import { taskStatuses } from '../server/db/schema.js';
import { getById } from '../server/lib/taskStatuses.js';
import { getTestData, prepareData } from './helpers/index.js';

const jar = (response) =>
  Object.fromEntries(response.cookies.map(({ name, value }) => [name, value]));

const alertText = (body) => {
  const match = body.match(/<div[^>]*role="alert"[^>]*>([^<]*)<\/div>/);
  return match ? match[1] : null;
};

const formBody = (fields) => new URLSearchParams(fields).toString();
const urlEncoded = { 'content-type': 'application/x-www-form-urlencoded' };

describe('test statuses CRUD', () => {
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

  const findByName = async (name) => {
    const [status] = await app.db.select().from(taskStatuses).where(eq(taskStatuses.name, name));
    return status;
  };

  it('guest is redirected from every statuses route', async () => {
    const routes = [
      { method: 'GET', url: app.reverse('statuses') },
      { method: 'GET', url: app.reverse('newStatus') },
      { method: 'GET', url: app.reverse('editStatus', { id: 1 }) },
      { method: 'POST', url: app.reverse('statuses'), payload: { data: { name: 'New' } } },
      {
        method: 'PATCH',
        url: app.reverse('updateStatus', { id: 1 }),
        payload: { data: { name: 'Updated' } },
      },
      { method: 'DELETE', url: app.reverse('deleteStatus', { id: 1 }) },
    ];
    for (const route of routes) {
      // eslint-disable-next-line no-await-in-loop
      const response = await app.inject(route);
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
    }
    const rows = await app.db.select().from(taskStatuses);
    expect(rows).toHaveLength(0);
  });

  it('index shows statuses for a signed-in user', async () => {
    const cookie = await signIn();
    await app.db.insert(taskStatuses).values({ name: 'In progress' });
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('statuses'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/<h1[^>]*>Statuses<\/h1>/);
    expect(response.body).toContain('In progress');
    expect(response.body).toContain('Create status');
  });

  it('new renders the creation form', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('newStatus'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('name="data[name]"');
    expect(response.body).toContain('id="data_name"');
    expect(response.body).toContain('placeholder="Name"');
    expect(response.body).toMatch(/type="submit"\s+value="Save"/);
  });

  it('create succeeds', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('statuses'),
      cookies: cookie,
      payload: { data: { name } },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/statuses');
    expect(await findByName(name)).toMatchObject({ name });

    // The flash rides in the session cookie updated by the redirect response.
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('statuses'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Status successfully created');
  });

  it('create rejects an empty name', async () => {
    const cookie = await signIn();
    const before = await app.db.select().from(taskStatuses);
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('statuses'),
      cookies: cookie,
      payload: { data: { name: '' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
    expect(alertText(response.body)).toBe('Failed to create status');
    const after = await app.db.select().from(taskStatuses);
    expect(after).toHaveLength(before.length);
  });

  it('create without a body responds 200, not 500', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('statuses'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
  });

  it('edit renders the prefilled form', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(taskStatuses).values({ name });
    const { id } = await findByName(name);
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('editStatus', { id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`value="${name}"`);
    expect(response.body).toContain('value="patch"');
  });

  it('edit responds 404 for unknown and garbage ids', async () => {
    const cookie = await signIn();

    const missing = await app.inject({
      method: 'GET',
      url: app.reverse('editStatus', { id: 99999 }),
      cookies: cookie,
    });
    expect(missing.statusCode).toBe(404);

    const notANumber = await app.inject({
      method: 'GET',
      url: '/statuses/abc/edit',
      cookies: cookie,
    });
    expect(notANumber.statusCode).toBe(404);
  });

  it('update changes the name', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(taskStatuses).values({ name });
    const { id } = await findByName(name);
    const newName = faker.lorem.word();
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateStatus', { id }),
      cookies: cookie,
      payload: { data: { name: newName } },
    });

    expect(response.statusCode).toBe(302);
    expect(await getById(app.db, id)).toMatchObject({ name: newName });
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('statuses'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Status has been updated');
  });

  it('update rejects an empty name without changing the row', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(taskStatuses).values({ name });
    const { id } = await findByName(name);
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateStatus', { id }),
      cookies: cookie,
      payload: { data: { name: '' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
    expect(alertText(response.body)).toBe('Failed to update status');
    expect(await getById(app.db, id)).toMatchObject({ name });
  });

  it('update responds 404 for an unknown id', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateStatus', { id: 99999 }),
      cookies: cookie,
      payload: { data: { name: 'Whatever' } },
    });

    expect(response.statusCode).toBe(404);
  });

  it('delete removes the status', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(taskStatuses).values({ name });
    const { id } = await findByName(name);
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteStatus', { id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    expect(await getById(app.db, id)).toBeUndefined();
    const list = await app.inject({
      method: 'GET',
      url: app.reverse('statuses'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(alertText(list.body)).toBe('Status has been deleted');
  });

  it('delete responds 404 for an unknown id', async () => {
    const cookie = await signIn();
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteStatus', { id: 99999 }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(404);
  });

  it('patch via form method override updates the status', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(taskStatuses).values({ name });
    const { id } = await findByName(name);
    const newName = faker.lorem.word();
    const response = await app.inject({
      method: 'POST',
      url: `/statuses/${id}`,
      cookies: cookie,
      payload: formBody({ 'data[name]': newName, _method: 'patch' }),
      headers: urlEncoded,
    });

    expect(response.statusCode).toBe(302);
    expect(await getById(app.db, id)).toMatchObject({ name: newName });
  });

  it('delete via form method override removes the status', async () => {
    const cookie = await signIn();
    const name = faker.lorem.word();
    await app.db.insert(taskStatuses).values({ name });
    const { id } = await findByName(name);
    const response = await app.inject({
      method: 'POST',
      url: `/statuses/${id}`,
      cookies: cookie,
      payload: formBody({ _method: 'delete' }),
      headers: urlEncoded,
    });

    expect(response.statusCode).toBe(302);
    expect(await getById(app.db, id)).toBeUndefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
