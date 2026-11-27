// @ts-check

import { eq } from 'drizzle-orm';
import { tasks } from '../db/schema.js';
import { getById as getStatusById } from './taskStatuses.js';
import { findById as getUserById } from './users.js';

export const getById = async (db, id) => {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  return task;
};

export const create = (db, { name, description, statusId, creatorId, executorId }) =>
  db.insert(tasks).values({ name, description, statusId, creatorId, executorId });

export const update = (db, id, { name, description, statusId, executorId }) =>
  db
    .update(tasks)
    .set({ name, description, statusId, executorId, updatedAt: new Date() })
    .where(eq(tasks.id, id));

export const remove = (db, id) => db.delete(tasks).where(eq(tasks.id, id));

// Form fields arrive as strings: they are normalized to numbers (or null)
// here so that no raw string ever reaches an integer column.
// ''/absent → null (empty), garbage → undefined (invalid), digits → number.
const normalizeId = (value) => {
  const raw = String(value ?? '').trim();
  if (raw === '') {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return undefined;
  }
  return Number.parseInt(raw, 10);
};

/**
 * Возвращает { errors, values }: errors — { поле: [{ message }] } (пустой объект
 * означает валидные данные), values — нормализованные значения для записи.
 * Form semantics: the form always submits every field, so an absent field
 * is treated as empty on purpose (PATCH sends the whole form).
 * `t` translates the messages in the language of the current request.
 * @param {(key: string) => string} t
 */
export const validate = async (db, data, t) => {
  const errors = {};
  const name = data?.name ?? '';

  if (name.length === 0) {
    errors.name = [{ message: t('validation.required') }];
  }

  const statusId = normalizeId(data?.statusId);
  if (statusId === null) {
    errors.statusId = [{ message: t('validation.required') }];
  } else if (statusId === undefined || !(await getStatusById(db, statusId))) {
    errors.statusId = [{ message: t('validation.tasks.statusInvalid') }];
  }

  const executorId = normalizeId(data?.executorId);
  if (executorId === undefined || (executorId !== null && !(await getUserById(db, executorId)))) {
    errors.executorId = [{ message: t('validation.tasks.executorInvalid') }];
  }

  return { errors, values: { name, description: data?.description ?? '', statusId, executorId } };
};
