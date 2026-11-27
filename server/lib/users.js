// @ts-check

import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import encrypt from './secure.js';

const minPasswordLength = 3;

export const findByEmail = async (db, email) => {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
};

export const findById = async (db, id) => {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
};

export const verifyPassword = (user, password) => encrypt(password) === user.passwordDigest;

export const create = (db, { email, password }) =>
  db.insert(users).values({ email, passwordDigest: encrypt(password) });

/**
 * Возвращает ошибки в виде { поле: [{ message }] }, пустой объект означает валидные данные.
 * `t` translates the messages in the language of the current request.
 * @param {(key: string) => string} t
 */
export const validate = async (db, data, t) => {
  const errors = {};
  const email = data?.email ?? '';
  const password = data?.password ?? '';

  if (email.length === 0) {
    errors.email = [{ message: t('validation.required') }];
  } else if (await findByEmail(db, email)) {
    errors.email = [{ message: t('validation.users.emailTaken') }];
  }

  if (password.length < minPasswordLength) {
    errors.password = [{ message: t('validation.users.passwordLength') }];
  }

  return errors;
};
