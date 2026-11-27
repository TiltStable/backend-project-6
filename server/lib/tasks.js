// @ts-check

import { eq } from 'drizzle-orm';
import { labels, tasks, taskLabels } from '../db/schema.js';
import { getById as getStatusById } from './taskStatuses.js';
import { getById as getLabelById } from './labels.js';
import { findById as getUserById } from './users.js';

export const getById = async (db, id) => {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  return task;
};

export const create = (db, { name, description, statusId, creatorId, executorId }) =>
  db
    .insert(tasks)
    .values({ name, description, statusId, creatorId, executorId })
    .returning({ id: tasks.id });

export const update = (db, id, { name, description, statusId, executorId }) =>
  db
    .update(tasks)
    .set({ name, description, statusId, executorId, updatedAt: new Date() })
    .where(eq(tasks.id, id));

export const remove = (db, id) => db.delete(tasks).where(eq(tasks.id, id));

export const getLabelsForTask = async (db, taskId) => {
  const rows = await db
    .select({ label: labels })
    .from(taskLabels)
    .innerJoin(labels, eq(taskLabels.labelId, labels.id))
    .where(eq(taskLabels.taskId, taskId));
  return rows.map(({ label }) => label);
};

export const getLabelIdsForTask = async (db, taskId) =>
  (await getLabelsForTask(db, taskId)).map((label) => label.id);

export const replaceLabelsForTask = async (db, taskId, labelIds) => {
  await db.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
  if (labelIds.length > 0) {
    await db.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId, labelId })));
  }
};

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
 * Возвращает { errors, values, labelIds }: errors — { поле: [{ message }] }
 * (пустой объект означает валидные данные), values — нормализованные значения
 * для записи, labelIds — нормализованные id меток для связи m2m.
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

  // qs sends an array for `data[labels][]`, but a JSON client may send a
  // scalar or nothing at all — the container is normalized first.
  // Validity is checked BEFORE dedupe: duplicated ids are valid, garbage is not.
  const rawLabels = Array.isArray(data?.labels)
    ? data.labels
    : data?.labels == null || data?.labels === ''
      ? []
      : [data.labels];
  const normalizedLabels = rawLabels.map((value) => normalizeId(value));
  const labelIds = [...new Set(normalizedLabels)].filter((id) => typeof id === 'number');
  if (normalizedLabels.some((id) => typeof id !== 'number')) {
    errors.labels = [{ message: t('validation.tasks.labelsInvalid') }];
  } else {
    const existing = await Promise.all(labelIds.map((labelId) => getLabelById(db, labelId)));
    if (existing.some((label) => !label)) {
      errors.labels = [{ message: t('validation.tasks.labelsInvalid') }];
    }
  }

  return {
    errors,
    values: { name, description: data?.description ?? '', statusId, executorId },
    labelIds,
  };
};
