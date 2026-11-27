// @ts-check

import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';

import fastify from 'fastify';
import init from '../server/plugin.js';
import { runMigrations } from '../server/db/index.js';
import { users } from '../server/db/schema.js';
import encrypt from '../server/lib/secure.js';
import { getTestData, prepareData } from './helpers/index.js';

let sequence = 0;
const uniqueEmail = () => `views-${Date.now()}-${(sequence += 1)}@example.com`;

// Cookies set by a response, ready to be sent with the next request.
const jar = (response) =>
  Object.fromEntries(response.cookies.map(({ name, value }) => [name, value]));

const alertText = (body) => {
  const match = body.match(/<div[^>]*role="alert"[^>]*>([^<]*)<\/div>/);
  return match ? match[1] : null;
};

describe('views', () => {
  let app;
  let testData;

  beforeAll(async () => {
    app = fastify({
      exposeHeadRoutes: false,
      logger: { target: 'pino-pretty' },
    });
    await init(app);
    await runMigrations(app.db);
    await prepareData(app);
    testData = getTestData();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url, cookies) => app.inject({ method: 'GET', url, cookies });

  describe('main page', () => {
    it('renders the menu in English by default', async () => {
      const res = await get('/');

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<html lang="en">');
      expect(res.body).toContain('<title>Task Manager</title>');
      expect(res.body).toMatch(/<a[^>]*href="\/session\/new"[^>]*>Login<\/a>/);
      expect(res.body).toMatch(/<a[^>]*href="\/users\/new"[^>]*>Register<\/a>/);
      expect(res.body).toMatch(/<a[^>]*href="\/users"[^>]*>Users<\/a>/);
      expect(res.body).toContain('Hello from Hexlet!');
      expect(res.body).toContain('© Hexlet Ltd, 2021');
    });

    it('switches to Russian with the query parameter and remembers it', async () => {
      const res = await get('/?lang=ru');

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<html lang="ru">');
      expect(res.body).toContain('<title>Менеджер задач</title>');
      expect(res.body).toMatch(/<a[^>]*href="\/session\/new"[^>]*>Вход<\/a>/);
      expect(res.body).toMatch(/<a[^>]*href="\/users\/new"[^>]*>Регистрация<\/a>/);
      expect(res.body).toMatch(/<a[^>]*href="\/users"[^>]*>Пользователи<\/a>/);
      expect(res.body).toContain('Привет от Хекслета!');
      expect(res.cookies.find(({ name }) => name === 'lang')?.value).toBe('ru');
    });

    it('restores the language from the cookie', async () => {
      expect((await get('/', { lang: 'ru' })).body).toContain('<html lang="ru">');
      expect((await get('/', { lang: 'en' })).body).toContain('<html lang="en">');
    });

    it('ignores an unsupported language', async () => {
      const res = await get('/?lang=xx');

      expect(res.body).toContain('<html lang="en">');
      expect(res.cookies.map(({ name }) => name)).not.toContain('lang');
    });
  });

  describe('forms', () => {
    it('localize labels, placeholders and buttons of the sign-in form', async () => {
      const en = (await get('/session/new')).body;
      expect(en).toMatch(/<label[^>]*for="data_email"[^>]*>Email<\/label>/);
      expect(en).toMatch(/<label[^>]*for="data_password"[^>]*>Password<\/label>/);
      expect(en).toContain('placeholder="Email"');
      expect(en).toContain('placeholder="Password"');
      expect(en).toMatch(/<h1[^>]*>Login<\/h1>/);

      const ru = (await get(app.reverse('newSession'), { lang: 'ru' })).body;
      expect(ru).toMatch(/<label[^>]*for="data_email"[^>]*>Email<\/label>/);
      expect(ru).toMatch(/<label[^>]*for="data_password"[^>]*>Пароль<\/label>/);
      expect(ru).toContain('placeholder="Пароль"');
      expect(ru).toMatch(/<h1[^>]*>Вход<\/h1>/);
      expect(ru).toMatch(/type="submit"\s+value="Войти"/);
    });

    it('localize the sign-up form', async () => {
      const en = (await get('/users/new')).body;
      expect(en).toMatch(/<h1[^>]*>Register<\/h1>/);
      expect(en).toMatch(/type="submit"\s+value="Register"/);

      const ru = (await get('/users/new', { lang: 'ru' })).body;
      expect(ru).toMatch(/<h1[^>]*>Регистрация<\/h1>/);
      expect(ru).toMatch(/type="submit"\s+value="Сохранить"/);
    });

    it('localize validation messages', async () => {
      const ru = await app.inject({
        method: 'POST',
        url: app.reverse('users'),
        cookies: { lang: 'ru' },
        payload: { data: {} },
      });
      expect(ru.statusCode).toBe(200);
      expect(ru.body).toContain('Не должно быть пустым');
      expect(ru.body).toContain('Не меньше 3 символов');

      const en = await app.inject({
        method: 'POST',
        url: app.reverse('users'),
        payload: { data: {} },
      });
      expect(en.body).toContain('Must not be empty');
      expect(en.body).toContain('Must be at least 3 characters');
    });

    it('localize the sign-in failure message', async () => {
      const { email, password } = testData.users.existing;
      // The truncated secret never matches the real one.
      const wrong = password.slice(0, -1);
      const res = await app.inject({
        method: 'POST',
        url: app.reverse('session'),
        cookies: { lang: 'ru' },
        payload: { data: { email, password: wrong } },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Неправильный емейл или пароль');
    });
  });

  describe('flash messages', () => {
    it('are rendered with role="alert" in the request language', async () => {
      // A failed sign-up re-renders the form, so the flash is shown on that very page.
      const failedRu = await app.inject({
        method: 'POST',
        url: app.reverse('users'),
        cookies: { lang: 'ru' },
        payload: { data: {} },
      });
      expect(failedRu.statusCode).toBe(200);
      expect(alertText(failedRu.body)).toBe('Не удалось зарегистрировать');

      const failedEn = await app.inject({
        method: 'POST',
        url: app.reverse('users'),
        payload: { data: {} },
      });
      expect(alertText(failedEn.body)).toBe('Failed to register');
    });

    it('announce a successful sign-up', async () => {
      const { firstName, lastName, password } = testData.users.new;
      const created = await app.inject({
        method: 'POST',
        url: app.reverse('users'),
        cookies: { lang: 'ru' },
        // Names are required by the step 3 assignment (the sign-up form matches the demo).
        payload: { data: { firstName, lastName, email: uniqueEmail(), password } },
      });
      expect(created.statusCode).toBe(302);
      expect(alertText((await get('/', { ...jar(created), lang: 'ru' })).body)).toBe(
        'Пользователь успешно зарегистрирован',
      );
    });

    it('announce a sign-out', async () => {
      const signedIn = await app.inject({
        method: 'POST',
        url: app.reverse('session'),
        cookies: { lang: 'ru' },
        payload: { data: testData.users.existing },
      });
      expect(signedIn.statusCode).toBe(302);

      const signedOut = await app.inject({
        method: 'DELETE',
        url: app.reverse('session'),
        cookies: { ...jar(signedIn), lang: 'ru' },
      });
      expect(signedOut.statusCode).toBe(302);
      expect(alertText((await get('/', { ...jar(signedOut), lang: 'ru' })).body)).toBe(
        'Вы разлогинены',
      );
    });

    it('explain an access denial on the protected page', async () => {
      const deniedRu = await get(app.reverse('protected'), { lang: 'ru' });
      expect(deniedRu.statusCode).toBe(302);
      expect(deniedRu.headers.location).toBe('/');
      expect(alertText((await get('/', { ...jar(deniedRu), lang: 'ru' })).body)).toBe(
        'Доступ запрещён! Пожалуйста, авторизируйтесь.',
      );

      const deniedEn = await get(app.reverse('protected'));
      expect(alertText((await get('/', jar(deniedEn))).body)).toBe('Access denied! Please login');
    });
  });

  describe('users page', () => {
    it('has a localized header and reference-formatted dates', async () => {
      const { password } = testData.users.new;
      await app.db.insert(users).values({
        email: uniqueEmail(),
        passwordDigest: encrypt(password),
        createdAt: new Date('2026-08-23T15:28:30.000Z'),
      });

      // Only the format is asserted: the date part depends on the server time zone.
      const en = (await get(app.reverse('users'))).body;
      expect(en).toMatch(/<h1[^>]*>Users<\/h1>/);
      expect(en).toMatch(/8\/2[234]\/2026, \d{1,2}:28:30 [AP]M/);

      const ru = (await get(app.reverse('users'), { lang: 'ru' })).body;
      expect(ru).toMatch(/<h1[^>]*>Пользователи<\/h1>/);
      expect(ru).toContain('Дата создания');
      expect(ru).toMatch(/8\/2[234]\/2026, \d{1,2}:28:30 [AP]M/);
    });
  });
});
