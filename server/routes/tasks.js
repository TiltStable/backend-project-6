// @ts-check

import _ from 'lodash';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { labels, tasks, taskStatuses, users } from '../db/schema.js';
import {
  create,
  getById,
  getLabelIdsForTask,
  getLabelsForTask,
  remove,
  replaceLabelsForTask,
  update,
  validate,
} from '../lib/tasks.js';

const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();

export default (app) => {
  // Route params are strings: the id is checked strictly, then parsed once.
  const findTaskOrNotFound = async (rawId) => {
    if (!/^\d+$/.test(String(rawId).trim())) {
      throw app.httpErrors.notFound();
    }
    const task = await getById(app.db, Number.parseInt(rawId, 10));
    if (!task) {
      throw app.httpErrors.notFound();
    }
    return task;
  };

  const loadFormData = async () => ({
    statuses: await app.db.select().from(taskStatuses),
    users: await app.db.select().from(users),
    labels: await app.db.select().from(labels),
  });

  app
    .get('/tasks', { name: 'tasks', preValidation: app.authenticate }, async (req, reply) => {
      const creators = alias(users, 'creator');
      const executors = alias(users, 'executor');
      const rows = await app.db
        .select({ task: tasks, status: taskStatuses, creator: creators, executor: executors })
        .from(tasks)
        .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
        .leftJoin(creators, eq(tasks.creatorId, creators.id))
        .leftJoin(executors, eq(tasks.executorId, executors.id))
        .orderBy(desc(tasks.id));
      const view = rows.map(({ task, status, creator, executor }) => ({
        ...task,
        statusName: status?.name ?? '',
        creatorName: creator ? fullName(creator) : '',
        executorName: executor ? fullName(executor) : '',
      }));
      reply.render('tasks/index', {
        tasks: view,
        currentUserId: req.user?.id ?? null,
        ...(await loadFormData()),
      });
      return reply;
    })
    .get(
      '/tasks/new',
      { name: 'newTask', preValidation: app.authenticate },
      async (_req, reply) => {
        reply.render('tasks/new', {
          task: {},
          selectedLabelIds: [],
          ...(await loadFormData()),
        });
        return reply;
      },
    )
    .post('/tasks', { preValidation: app.authenticate }, async (req, reply) => {
      const data = req.body?.data;
      const { errors, values, labelIds } = await validate(app.db, data, req.t);

      if (!_.isEmpty(errors)) {
        req.flash('error', req.t('flash.tasks.create.error'));
        reply.render('tasks/new', {
          task: { ...data },
          selectedLabelIds: labelIds,
          ...(await loadFormData()),
          errors,
        });
        return reply;
      }

      // The task row and its label links are stored atomically.
      await app.db.transaction(async (tx) => {
        const [{ id }] = await create(tx, { ...values, creatorId: req.user.id });
        await replaceLabelsForTask(tx, id, labelIds);
      });
      req.flash('info', req.t('flash.tasks.create.success'));
      reply.redirect(app.reverse('tasks'));
      return reply;
    })
    .get(
      '/tasks/:id',
      { name: 'showTask', preValidation: app.authenticate },
      async (req, reply) => {
        const task = await findTaskOrNotFound(req.params.id);
        const creators = alias(users, 'creator');
        const executors = alias(users, 'executor');
        const [row] = await app.db
          .select({ status: taskStatuses, creator: creators, executor: executors })
          .from(tasks)
          .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
          .leftJoin(creators, eq(tasks.creatorId, creators.id))
          .leftJoin(executors, eq(tasks.executorId, executors.id))
          .where(eq(tasks.id, task.id));
        const taskLabels = await getLabelsForTask(app.db, task.id);
        reply.render('tasks/show', {
          task,
          statusName: row.status?.name ?? '',
          creatorName: row.creator ? fullName(row.creator) : '',
          executorName: row.executor ? fullName(row.executor) : '',
          labels: taskLabels,
          currentUserId: req.user.id,
        });
        return reply;
      },
    )
    .get(
      '/tasks/:id/edit',
      { name: 'editTask', preValidation: app.authenticate },
      async (req, reply) => {
        const task = await findTaskOrNotFound(req.params.id);
        const selectedLabelIds = await getLabelIdsForTask(app.db, task.id);
        reply.render('tasks/edit', {
          task,
          selectedLabelIds,
          ...(await loadFormData()),
        });
        return reply;
      },
    )
    .patch(
      '/tasks/:id',
      { name: 'updateTask', preValidation: app.authenticate },
      async (req, reply) => {
        const task = await findTaskOrNotFound(req.params.id);
        const data = req.body?.data;
        const { errors, values, labelIds } = await validate(app.db, data, req.t);

        if (!_.isEmpty(errors)) {
          req.flash('error', req.t('flash.tasks.update.error'));
          reply.render('tasks/edit', {
            task: { ...task, ...values, ...data },
            selectedLabelIds: labelIds,
            ...(await loadFormData()),
            errors,
          });
          return reply;
        }

        // The task row and its label links are updated atomically.
        await app.db.transaction(async (tx) => {
          await update(tx, task.id, values);
          await replaceLabelsForTask(tx, task.id, labelIds);
        });
        req.flash('success', req.t('flash.tasks.update.success'));
        reply.redirect(app.reverse('tasks'));
        return reply;
      },
    )
    .delete(
      '/tasks/:id',
      { name: 'deleteTask', preValidation: app.authenticate },
      async (req, reply) => {
        const task = await findTaskOrNotFound(req.params.id);
        if (task.creatorId !== req.user.id) {
          req.flash('error', req.t('flash.users.noRights'));
          reply.redirect(app.reverse('tasks'));
          return reply;
        }
        await remove(app.db, task.id);
        req.flash('success', req.t('flash.tasks.delete.success'));
        reply.redirect(app.reverse('tasks'));
        return reply;
      },
    );
};
