// @ts-check

import { eq } from 'drizzle-orm';
import { labels } from '../db/schema.js';

export const getById = async (db, id) => {
  const [label] = await db.select().from(labels).where(eq(labels.id, id));
  return label;
};

export const create = (db, { name }) => db.insert(labels).values({ name });

export const update = (db, id, { name }) =>
  db.update(labels).set({ name, updatedAt: new Date() }).where(eq(labels.id, id));

export const remove = (db, id) => db.delete(labels).where(eq(labels.id, id));

/**
 * Возвращает ошибки в виде { поле: [{ message }] }, пустой объект означает валидные данные.
 * Sync by design (same as taskStatuses): if this ever becomes async, add await at call sites.
 * `t` translates the messages in the language of the current request.
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
