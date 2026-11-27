// @ts-check

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import fastifyFormbody from '@fastify/formbody';
import fastifySecureSession from '@fastify/secure-session';
import fastifyPassport from '@fastify/passport';
import fastifySensible from '@fastify/sensible';
import { plugin as fastifyReverseRoutes } from 'fastify-reverse-routes';
import qs from 'qs';
import { Eta } from 'eta';
import i18next from 'i18next';

import ru from './locales/ru.js';
import en from './locales/en.js';
// @ts-expect-error
import addRoutes from './routes/index.js';
import getHelpers from './helpers/index.js';
import { closeDb, createDb } from './db/index.js';
import { findById } from './lib/users.js';
import fastifyMethodOverride from '@hexlet/fastify-method-override';
import FormStrategy from './lib/passportStrategies/FormStrategy.js';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  getSupportedLanguages,
  resolveLanguage,
} from './lib/language.js';

const __dirname = fileURLToPath(path.dirname(import.meta.url));

const mode = process.env.NODE_ENV || 'development';
// const isDevelopment = mode === 'development';

const setUpViews = (app) => {
  const helpers = getHelpers(app);
  const eta = new Eta();

  app.register(fastifyView, {
    engine: {
      eta,
    },
    defaultContext: {
      ...helpers,
      assetPath: (filename) => `/assets/${filename}`,
    },
    templates: path.join(__dirname, '..', 'server', 'views'),
  });

  // Translations depend on the request language, so they are passed per request.
  app.decorateReply('render', function render(viewPath, locals) {
    const { lang, t } = this.request;
    if (typeof t !== 'function') {
      throw new Error('Request language is not resolved: the preParsing hook did not run');
    }

    this.view(viewPath, { ...locals, lang, t, reply: this });
  });
};

const setUpStaticAssets = (app) => {
  const pathPublic = path.join(__dirname, '..', 'dist');
  app.register(fastifyStatic, {
    root: pathPublic,
    prefix: '/assets/',
  });
};

const setupLocalization = async () => {
  await i18next.init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: 'ru',
    // debug: isDevelopment,
    resources: {
      ru,
      en,
    },
  });
};

const addRequestLanguage = (app) => {
  const supportedLanguages = getSupportedLanguages(i18next.options.resources);
  app.decorateRequest('lang', null);
  app.decorateRequest('t', null);

  // Runs before preValidation, where authentication may answer with a flash message.
  app.addHook('preParsing', async (req, reply) => {
    const { language, remember } = resolveLanguage(req, supportedLanguages);
    req.lang = language;
    req.t = i18next.getFixedT(language);
    if (remember) {
      reply.setCookie(LANGUAGE_COOKIE, language, { path: '/', httpOnly: true, sameSite: 'lax' });
    }
  });
};

const addHooks = (app) => {
  addRequestLanguage(app);

  app.addHook('preHandler', async (req, reply) => {
    reply.locals = {
      isAuthenticated: () => req.isAuthenticated(),
    };
  });
};

const setUpDatabase = (app) => {
  const db = createDb(mode);
  app.decorate('db', db);
  app.addHook('onClose', () => closeDb(db));
};

const registerPlugins = async (app) => {
  setUpDatabase(app);
  await app.register(fastifySensible);
  await app.register(fastifyReverseRoutes);
  await app.register(fastifyFormbody, { parser: qs.parse });
  await app.register(fastifySecureSession, {
    secret: process.env.SESSION_KEY,
    cookie: {
      path: '/',
    },
  });

  fastifyPassport.registerUserDeserializer((user) => findById(app.db, user.id));
  fastifyPassport.registerUserSerializer((user) => Promise.resolve(user));
  fastifyPassport.use(new FormStrategy('form', app));
  await app.register(fastifyPassport.initialize());
  await app.register(fastifyPassport.secureSession());
  await app.decorate('fp', fastifyPassport);
  app.decorate('authenticate', (...args) =>
    fastifyPassport.authenticate(
      'form',
      {
        failureRedirect: app.reverse('root'),
        // The strategy reports the message itself because it depends on the request language.
        failureFlash: true,
      },
      // @ts-expect-error
    )(...args),
  );

  await app.register(fastifyMethodOverride);
};

export const options = {
  exposeHeadRoutes: false,
};

export default async (app, _options) => {
  await registerPlugins(app);

  await setupLocalization();
  setUpViews(app);
  setUpStaticAssets(app);
  addRoutes(app);
  addHooks(app);

  return app;
};
