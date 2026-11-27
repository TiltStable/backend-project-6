// @ts-check

import { eq } from 'drizzle-orm';
import { taskStatuses } from '../db/schema.js';

export const getById = async (db, id) => {
  const [status] = await db.select().from(taskStatuses).where(eq(taskStatuses.id, id));
  return status;
};

export const create = (db, { name }) => db.insert(taskStatuses).values({ name });

export const update = (db, id, { name }) =>
  db.update(taskStatuses).set({ name, updatedAt: new Date() }).where(eq(taskStatuses.id, id));

export const remove = (db, id) => db.delete(taskStatuses).where(eq(taskStatuses.id, id));

/**
 * Возвращает ошибки в виде { поле: [{ message }] }, пустой объект означает валидные данные.
 * `t` translates the messages in the language of the current request.
 * Sync by design: if this ever becomes async, add await at both call sites
 * in routes/statuses.js — _.isEmpty(promise) is true and the error branch
 * would be silently skipped.
 * @param {(key: string) => string} t
 */
export const validate = (data, t) => {
  const errors = {};
  const name = data?.name ?? '';

  if (name.length === 0) {
    errors.name = [{ message: t('validation.required') }];
  }

  return errors;
};
