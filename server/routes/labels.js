// @ts-check

import _ from 'lodash';
import { eq } from 'drizzle-orm';
import { labels, taskLabels } from '../db/schema.js';
import { create, getById, remove, update, validate } from '../lib/labels.js';

export default (app) => {
  // Route params are strings: the id is checked strictly, then parsed once.
  const findLabelOrNotFound = async (rawId) => {
    if (!/^\d+$/.test(String(rawId).trim())) {
      throw app.httpErrors.notFound();
    }
    const label = await getById(app.db, Number.parseInt(rawId, 10));
    if (!label) {
      throw app.httpErrors.notFound();
    }
    return label;
  };

  app
    .get('/labels', { name: 'labels', preValidation: app.authenticate }, async (_req, reply) => {
      const allLabels = await app.db.select().from(labels);
      reply.render('labels/index', { labels: allLabels });
      return reply;
    })
    .get('/labels/new', { name: 'newLabel', preValidation: app.authenticate }, (_req, reply) => {
      reply.render('labels/new', { label: {} });
      return reply;
    })
    .post('/labels', { preValidation: app.authenticate }, async (req, reply) => {
      const data = req.body?.data;
      const errors = validate(data, req.t);

      if (!_.isEmpty(errors)) {
        req.flash('error', req.t('flash.labels.create.error'));
        reply.render('labels/new', { label: data, errors });
        return reply;
      }

      await create(app.db, data);
      req.flash('info', req.t('flash.labels.create.success'));
      reply.redirect(app.reverse('labels'));
      return reply;
    })
    .get(
      '/labels/:id/edit',
      { name: 'editLabel', preValidation: app.authenticate },
      async (req, reply) => {
        const label = await findLabelOrNotFound(req.params.id);
        reply.render('labels/edit', { label, errors: {} });
        return reply;
      },
    )
    .patch(
      '/labels/:id',
      { name: 'updateLabel', preValidation: app.authenticate },
      async (req, reply) => {
        const label = await findLabelOrNotFound(req.params.id);
        const data = req.body?.data;
        const errors = validate(data, req.t);

        if (!_.isEmpty(errors)) {
          req.flash('error', req.t('flash.labels.update.error'));
          reply.render('labels/edit', { label: { ...label, name: data?.name }, errors });
          return reply;
        }

        await update(app.db, label.id, data);
        req.flash('success', req.t('flash.labels.update.success'));
        reply.redirect(app.reverse('labels'));
        return reply;
      },
    )
    .delete(
      '/labels/:id',
      { name: 'deleteLabel', preValidation: app.authenticate },
      async (req, reply) => {
        const label = await findLabelOrNotFound(req.params.id);
        // A label referenced by at least one task is kept.
        const relatedTasks = await app.db
          .select({ taskId: taskLabels.taskId })
          .from(taskLabels)
          .where(eq(taskLabels.labelId, label.id));
        if (relatedTasks.length > 0) {
          req.flash('error', req.t('flash.labels.delete.blocked'));
          reply.redirect(app.reverse('labels'));
          return reply;
        }
        await remove(app.db, label.id);
        req.flash('success', req.t('flash.labels.delete.success'));
        reply.redirect(app.reverse('labels'));
        return reply;
      },
    );
};
