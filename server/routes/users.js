// @ts-check

import _ from 'lodash';
import { users } from '../db/schema.js';
import { create, findById, remove, update, validate } from '../lib/users.js';

export default (app) => {
  // Route params are strings: the id is parsed once and reused everywhere.
  const findUserOrNotFound = async (rawId) => {
    if (!/^\d+$/.test(String(rawId).trim())) {
      throw app.httpErrors.notFound();
    }
    const id = Number.parseInt(rawId, 10);
    const user = await findById(app.db, id);
    if (!user) {
      throw app.httpErrors.notFound();
    }
    return { id, user };
  };

  // Only the user themselves may edit, update and delete their account.
  const denyIfNotSelf = (req, reply, id) => {
    if (req.user.id === id) {
      return false;
    }
    req.flash('error', req.t('flash.users.noRights'));
    reply.redirect(app.reverse('root'));
    return true;
  };

  app
    .get('/users', { name: 'users' }, async (req, reply) => {
      const allUsers = await app.db.select().from(users);
      reply.render('users/index', { users: allUsers, currentUserId: req.user?.id ?? null });
      return reply;
    })
    .get('/users/new', { name: 'newUser' }, (_req, reply) => {
      reply.render('users/new', { user: {} });
    })
    .post('/users', async (req, reply) => {
      const data = req.body.data;
      const errors = await validate(app.db, data, req.t);

      if (!_.isEmpty(errors)) {
        req.flash('error', req.t('flash.users.create.error'));
        reply.render('users/new', { user: data, errors });
        return reply;
      }

      await create(app.db, data);
      req.flash('info', req.t('flash.users.create.success'));
      reply.redirect(app.reverse('root'));
      return reply;
    })
    .get(
      '/users/:id/edit',
      { name: 'editUser', preValidation: app.authenticate },
      async (req, reply) => {
        const { id, user } = await findUserOrNotFound(req.params.id);
        if (denyIfNotSelf(req, reply, id)) {
          return reply;
        }
        reply.render('users/edit', { user, errors: {} });
        return reply;
      },
    )
    .patch(
      '/users/:id',
      { name: 'updateUser', preValidation: app.authenticate },
      async (req, reply) => {
        const { id, user } = await findUserOrNotFound(req.params.id);
        if (denyIfNotSelf(req, reply, id)) {
          return reply;
        }
        const data = req.body?.data;
        const errors = await validate(app.db, data, req.t, {
          excludeUserId: id,
          passwordOptional: true,
        });

        if (!_.isEmpty(errors)) {
          req.flash('error', req.t('flash.users.update.error'));
          reply.render('users/edit', {
            user: { ...user, ..._.pick(data, ['firstName', 'lastName', 'email']) },
            errors,
          });
          return reply;
        }

        await update(app.db, id, data);
        req.flash('success', req.t('flash.users.update.success'));
        reply.redirect(app.reverse('root'));
        return reply;
      },
    )
    .delete(
      '/users/:id',
      { name: 'deleteUser', preValidation: app.authenticate },
      async (req, reply) => {
        const { id } = await findUserOrNotFound(req.params.id);
        if (denyIfNotSelf(req, reply, id)) {
          return reply;
        }
        await remove(app.db, id);
        // The account is gone, the current session must not survive it.
        await req.logOut();
        req.flash('success', req.t('flash.users.delete.success'));
        reply.redirect(app.reverse('root'));
        return reply;
      },
    );
};
