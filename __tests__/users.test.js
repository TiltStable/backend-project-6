// @ts-check

import { faker } from '@faker-js/faker';
import _ from 'lodash';
import fastify from 'fastify';

import init from '../server/plugin.js';
import encrypt from '../server/lib/secure.js';
import { runMigrations } from '../server/db/index.js';
import { findByEmail, findById, remove } from '../server/lib/users.js';
import { getTestData, prepareData } from './helpers/index.js';

describe('test users CRUD', () => {
  let app;
  const testData = getTestData();

  beforeAll(async () => {
    app = fastify({
      exposeHeadRoutes: false,
      logger: { target: 'pino-pretty' },
    });
    await init(app);

    // TODO: пока один раз перед тестами
    // тесты не должны зависеть друг от друга
    // перед каждым тестом выполняем миграции
    // и заполняем БД тестовыми данными
    await runMigrations(app.db);
    await prepareData(app);
  });

  beforeEach(async () => {});

  it('index', async () => {
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('users'),
    });

    expect(response.statusCode).toBe(200);
  });

  it('new', async () => {
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('newUser'),
    });

    expect(response.statusCode).toBe(200);
  });

  it('create', async () => {
    const params = testData.users.new;
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('users'),
      payload: {
        data: params,
      },
    });

    expect(response.statusCode).toBe(302);
    const expected = {
      ..._.omit(params, 'password'),
      passwordDigest: encrypt(params.password),
    };
    const user = await findByEmail(app.db, params.email);
    expect(user).toMatchObject(expected);
  });

  it('create requires first and last name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('users'),
      payload: {
        data: {
          email: faker.internet.email(),
          password: faker.internet.password({ length: 10 }),
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
  });

  it('create rejects an invalid email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('users'),
      payload: {
        data: {
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email: 'not-an-email',
          password: faker.internet.password({ length: 10 }),
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must be a valid email');
  });

  const jar = (response) =>
    Object.fromEntries(response.cookies.map(({ name, value }) => [name, value]));

  const signIn = async (params) => {
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('session'),
      payload: { data: params },
    });
    expect(response.statusCode).toBe(302);
    return jar(response);
  };

  const createViaSignUp = async (overrides = {}) => {
    const params = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      password: faker.internet.password({ length: 12 }),
      ...overrides,
    };
    const response = await app.inject({
      method: 'POST',
      url: app.reverse('users'),
      payload: { data: params },
    });
    expect(response.statusCode).toBe(302);
    return { params, user: await findByEmail(app.db, params.email) };
  };

  const formBody = (fields) => new URLSearchParams(fields).toString();
  const urlEncoded = { 'content-type': 'application/x-www-form-urlencoded' };

  it('index shows full names without action buttons for guests', async () => {
    const response = await app.inject({ method: 'GET', url: app.reverse('users') });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Full name');
    expect(response.body).toContain('Lawrence Kulas');
    expect(response.body).not.toMatch(/users\/\d+\/edit/);
    expect(response.body).not.toContain('Delete');
  });

  it('index shows action buttons only on the own row', async () => {
    const cookie = await signIn(testData.users.existing);
    const { id } = await findByEmail(app.db, testData.users.existing.email);
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('users'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(app.reverse('editUser', { id }));
    expect(response.body).toContain(`action="${app.reverse('deleteUser', { id })}"`);
  });

  it('edit requires authentication', async () => {
    const { user } = await createViaSignUp();
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('editUser', { id: user.id }),
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
  });

  it('edit renders the own profile', async () => {
    const { params, user } = await createViaSignUp();
    const cookie = await signIn(params);
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('editUser', { id: user.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('name="data[firstName]"');
    expect(response.body).toContain('id="data_firstName"');
    expect(response.body).toContain(`value="${params.firstName}"`);
    expect(response.body).toContain('value="patch"');
  });

  it('edit of another user redirects with a flash', async () => {
    const { params } = await createViaSignUp();
    const other = await createViaSignUp();
    const cookie = await signIn(params);
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('editUser', { id: other.user.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
    // The flash rides in the session cookie updated by the redirect response.
    const root = await app.inject({
      method: 'GET',
      url: app.reverse('root'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(root.body).toContain('You are not allowed to perform this action');
  });

  it('edit of an unknown user responds 404', async () => {
    const { params } = await createViaSignUp();
    const cookie = await signIn(params);

    const missing = await app.inject({
      method: 'GET',
      url: app.reverse('editUser', { id: 99999 }),
      cookies: cookie,
    });
    expect(missing.statusCode).toBe(404);

    const notANumber = await app.inject({
      method: 'GET',
      url: '/users/abc/edit',
      cookies: cookie,
    });
    expect(notANumber.statusCode).toBe(404);

    const garbageTail = await app.inject({
      method: 'GET',
      url: '/users/12abc/edit',
      cookies: cookie,
    });
    expect(garbageTail.statusCode).toBe(404);
  });

  it('update changes the own profile', async () => {
    const { params, user } = await createViaSignUp();
    const cookie = await signIn(params);
    const patch = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      password: faker.internet.password({ length: 9 }),
    };
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateUser', { id: user.id }),
      cookies: cookie,
      payload: { data: patch },
    });

    expect(response.statusCode).toBe(302);
    const updated = await findByEmail(app.db, patch.email);
    expect(updated).toMatchObject({ firstName: patch.firstName, lastName: patch.lastName });
    expect(updated.passwordDigest).toBe(encrypt(patch.password));
    expect(await findByEmail(app.db, params.email)).toBeUndefined();
  });

  it('update keeps the password when it is blank', async () => {
    const { params, user } = await createViaSignUp();
    const cookie = await signIn(params);
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateUser', { id: user.id }),
      cookies: cookie,
      payload: {
        data: {
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          // The same email must not be reported as taken for the user himself.
          email: params.email,
          password: '',
        },
      },
    });

    expect(response.statusCode).toBe(302);
    const updated = await findByEmail(app.db, params.email);
    expect(updated.passwordDigest).toBe(user.passwordDigest);
  });

  it('update shows validation errors without changing the row', async () => {
    const { params, user } = await createViaSignUp();
    const cookie = await signIn(params);
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateUser', { id: user.id }),
      cookies: cookie,
      payload: { data: { firstName: '', lastName: params.lastName, email: 'bad', password: 'ab' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Must not be empty');
    expect(response.body).toContain('Must be a valid email');
    expect(response.body).toContain('Must be at least 3 characters');
    const unchanged = await findByEmail(app.db, params.email);
    expect(unchanged.passwordDigest).toBe(user.passwordDigest);
    expect(unchanged.firstName).toBe(params.firstName);
  });

  it('update of another user is denied', async () => {
    const { params } = await createViaSignUp();
    const other = await createViaSignUp();
    const cookie = await signIn(params);
    const patch = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      password: faker.internet.password({ length: 9 }),
    };
    const response = await app.inject({
      method: 'PATCH',
      url: app.reverse('updateUser', { id: other.user.id }),
      cookies: cookie,
      payload: { data: patch },
    });

    expect(response.statusCode).toBe(302);
    expect(await findByEmail(app.db, patch.email)).toBeUndefined();
    const unchanged = await findByEmail(app.db, other.params.email);
    expect(unchanged.passwordDigest).toBe(other.user.passwordDigest);
    const root = await app.inject({
      method: 'GET',
      url: app.reverse('root'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(root.body).toContain('You are not allowed to perform this action');
  });

  it('delete of another user is denied', async () => {
    const { params } = await createViaSignUp();
    const other = await createViaSignUp();
    const cookie = await signIn(params);
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteUser', { id: other.user.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    expect(await findById(app.db, other.user.id)).toMatchObject({ email: other.params.email });
  });

  it('delete removes the own account and ends the session', async () => {
    const { params, user } = await createViaSignUp();
    const cookie = await signIn(params);
    const response = await app.inject({
      method: 'DELETE',
      url: app.reverse('deleteUser', { id: user.id }),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(302);
    expect(await findById(app.db, user.id)).toBeUndefined();
    const root = await app.inject({
      method: 'GET',
      url: app.reverse('root'),
      cookies: { ...cookie, ...jar(response) },
    });
    expect(root.body).toContain('User has been deleted');
    const signInAgain = await app.inject({
      method: 'POST',
      url: app.reverse('session'),
      payload: { data: params },
    });
    expect(signInAgain.statusCode).toBe(200);
  });

  it('a stale session pointing to a deleted user degrades to a guest session', async () => {
    const { params } = await createViaSignUp();
    const cookie = await signIn(params);
    const { id } = await findByEmail(app.db, params.email);
    // The account is deleted behind the session's back (another device did it).
    await remove(app.db, id);
    const response = await app.inject({
      method: 'GET',
      url: app.reverse('root'),
      cookies: cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/<a[^>]*href="\/users\/new"[^>]*>Register<\/a>/);
  });

  it('patch via form method override updates the own profile', async () => {
    const { params, user } = await createViaSignUp();
    const cookie = await signIn(params);
    const patch = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    const response = await app.inject({
      method: 'POST',
      url: `/users/${user.id}`,
      cookies: cookie,
      payload: formBody({
        'data[firstName]': patch.firstName,
        'data[lastName]': patch.lastName,
        'data[email]': params.email,
        'data[password]': '',
        _method: 'patch',
      }),
      headers: urlEncoded,
    });

    expect(response.statusCode).toBe(302);
    const updated = await findByEmail(app.db, params.email);
    expect(updated).toMatchObject(patch);
    expect(updated.passwordDigest).toBe(user.passwordDigest);
  });

  it('delete via form method override removes the own account', async () => {
    const { params, user } = await createViaSignUp();
    const cookie = await signIn(params);
    const response = await app.inject({
      method: 'POST',
      url: `/users/${user.id}`,
      cookies: cookie,
      payload: formBody({ _method: 'delete' }),
      headers: urlEncoded,
    });

    expect(response.statusCode).toBe(302);
    expect(await findById(app.db, user.id)).toBeUndefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
