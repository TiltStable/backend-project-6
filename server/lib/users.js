// @ts-check

import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import encrypt from './secure.js';

const minPasswordLength = 3;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const findByEmail = async (db, email) => {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
};

export const findById = async (db, id) => {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
};

export const verifyPassword = (user, password) => encrypt(password) === user.passwordDigest;

export const create = (db, { firstName, lastName, email, password }) =>
  db.insert(users).values({
    firstName,
    lastName,
    email,
    passwordDigest: encrypt(password),
  });

// An empty password keeps the current passwordDigest (editing a profile without re-entering it).
export const update = (db, id, data) => {
  const { firstName, lastName, email, password } = data;
  const values = {
    firstName,
    lastName,
    email,
    updatedAt: new Date(),
  };
  if (password) {
    values.passwordDigest = encrypt(password);
  }
  return db.update(users).set(values).where(eq(users.id, id));
};

export const remove = (db, id) => db.delete(users).where(eq(users.id, id));

/**
 * Возвращает ошибки в виде { поле: [{ message }] }, пустой объект означает валидные данные.
 * `t` translates the messages in the language of the current request.
 * @param {(key: string) => string} t
 * @param {{ excludeUserId?: number | null, passwordOptional?: boolean }} [options]
 */
export const validate = async (
  db,
  data,
  t,
  { excludeUserId = null, passwordOptional = false } = {},
) => {
  const errors = {};
  const firstName = data?.firstName ?? '';
  const lastName = data?.lastName ?? '';
  const email = data?.email ?? '';
  const password = data?.password ?? '';

  if (firstName.length === 0) {
    errors.firstName = [{ message: t('validation.required') }];
  }

  if (lastName.length === 0) {
    errors.lastName = [{ message: t('validation.required') }];
  }

  if (email.length === 0) {
    errors.email = [{ message: t('validation.required') }];
  } else if (!emailPattern.test(email)) {
    errors.email = [{ message: t('validation.users.emailInvalid') }];
  } else {
    const existing = await findByEmail(db, email);
    if (existing && existing.id !== excludeUserId) {
      errors.email = [{ message: t('validation.users.emailTaken') }];
    }
  }

  const passwordIsKept = passwordOptional && password.length === 0;
  if (!passwordIsKept && password.length < minPasswordLength) {
    errors.password = [{ message: t('validation.users.passwordLength') }];
  }

  return errors;
};
