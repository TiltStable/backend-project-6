// @ts-check

import _ from 'lodash';
import { taskStatuses } from '../db/schema.js';
import { create, getById, remove, update, validate } from '../lib/taskStatuses.js';

export default (app) => {
  // Route params are strings: the id is checked strictly, then parsed once.
  const findStatusOrNotFound = async (rawId) => {
    if (!/^\d+$/.test(String(rawId).trim())) {
      throw app.httpErrors.notFound();
    }
    const status = await getById(app.db, Number.parseInt(rawId, 10));
    if (!status) {
      throw app.httpErrors.notFound();
    }
    return status;
  };

  app
    .get(
      '/statuses',
      { name: 'statuses', preValidation: app.authenticate },
      async (_req, reply) => {
        const allStatuses = await app.db.select().from(taskStatuses);
        reply.render('statuses/index', { statuses: allStatuses });
        return reply;
      },
    )
    .get('/statuses/new', { name: 'newStatus', preValidation: app.authenticate }, (_req, reply) => {
      reply.render('statuses/new', { status: {} });
    })
    .post('/statuses', { preValidation: app.authenticate }, async (req, reply) => {
      const data = req.body?.data;
      const errors = validate(data, req.t);

      if (!_.isEmpty(errors)) {
        req.flash('error', req.t('flash.statuses.create.error'));
        reply.render('statuses/new', { status: data, errors });
        return reply;
      }

      await create(app.db, data);
      req.flash('info', req.t('flash.statuses.create.success'));
      reply.redirect(app.reverse('statuses'));
      return reply;
    })
    .get(
      '/statuses/:id/edit',
      { name: 'editStatus', preValidation: app.authenticate },
      async (req, reply) => {
        const status = await findStatusOrNotFound(req.params.id);
        reply.render('statuses/edit', { status, errors: {} });
        return reply;
      },
    )
    .patch(
      '/statuses/:id',
      { name: 'updateStatus', preValidation: app.authenticate },
      async (req, reply) => {
        const status = await findStatusOrNotFound(req.params.id);
        const data = req.body?.data;
        const errors = validate(data, req.t);

        if (!_.isEmpty(errors)) {
          req.flash('error', req.t('flash.statuses.update.error'));
          reply.render('statuses/edit', { status: { ...status, name: data?.name }, errors });
          return reply;
        }

        await update(app.db, status.id, data);
        req.flash('success', req.t('flash.statuses.update.success'));
        reply.redirect(app.reverse('statuses'));
        return reply;
      },
    )
    .delete(
      '/statuses/:id',
      { name: 'deleteStatus', preValidation: app.authenticate },
      async (req, reply) => {
        const status = await findStatusOrNotFound(req.params.id);
        await remove(app.db, status.id);
        req.flash('success', req.t('flash.statuses.delete.success'));
        reply.redirect(app.reverse('statuses'));
        return reply;
      },
    );
};
