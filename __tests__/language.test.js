// @ts-check

import { describe, expect, it } from '@jest/globals';
import { formatDate } from '../server/helpers/index.js';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  getSupportedLanguages,
  resolveLanguage,
} from '../server/lib/language.js';
import en from '../server/locales/en.js';
import ru from '../server/locales/ru.js';

const supported = ['en', 'ru'];

const flattenKeys = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flattenKeys(value, `${prefix}${key}.`),
  );

describe('resolveLanguage', () => {
  it('falls back to the default language', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(resolveLanguage({}, supported)).toEqual({ language: 'en', remember: false });
  });

  it('takes the language from the query and asks to remember it', () => {
    expect(LANGUAGE_COOKIE).toBe('lang');
    expect(resolveLanguage({ query: { lang: 'ru' } }, supported)).toEqual({
      language: 'ru',
      remember: true,
    });
  });

  it('matches the language regardless of letter case', () => {
    expect(resolveLanguage({ query: { lang: 'RU' } }, supported)).toEqual({
      language: 'ru',
      remember: true,
    });
    expect(resolveLanguage({ cookies: { lang: 'EN' } }, supported)).toEqual({
      language: 'en',
      remember: false,
    });
  });

  it('restores the language from the cookie', () => {
    expect(resolveLanguage({ cookies: { lang: 'ru' } }, supported)).toEqual({
      language: 'ru',
      remember: false,
    });
  });

  it('prefers the query over the cookie', () => {
    expect(resolveLanguage({ query: { lang: 'en' }, cookies: { lang: 'ru' } }, supported)).toEqual({
      language: 'en',
      remember: true,
    });
  });

  it('ignores unsupported or ambiguous values', () => {
    expect(resolveLanguage({ query: { lang: 'xx' } }, supported)).toEqual({
      language: 'en',
      remember: false,
    });
    expect(resolveLanguage({ query: { lang: 'xx' }, cookies: { lang: 'ru' } }, supported)).toEqual({
      language: 'ru',
      remember: false,
    });
    expect(resolveLanguage({ cookies: { lang: 'xx' } }, supported)).toEqual({
      language: 'en',
      remember: false,
    });
    // A repeated parameter is parsed as an array.
    expect(resolveLanguage({ query: { lang: ['ru', 'en'] } }, supported)).toEqual({
      language: 'en',
      remember: false,
    });
  });
});

describe('formatDate', () => {
  // Only the format is asserted: the date part depends on the server time zone.
  it('uses the reference format regardless of the server locale', () => {
    expect(formatDate('2026-08-23T15:28:30.000Z')).toMatch(
      /^\d{1,2}\/2[234]\/2026, \d{1,2}:28:30 [AP]M$/,
    );
  });
});

describe('getSupportedLanguages', () => {
  it('lists the languages that have translations', () => {
    expect(getSupportedLanguages({ ru: {}, en: {} })).toEqual(['ru', 'en']);
  });

  it('stops the server when the default language has no translations', () => {
    expect(() => getSupportedLanguages({ ru: {} })).toThrow('default language');
    expect(() => getSupportedLanguages(undefined)).toThrow('default language');
  });
});

describe('locales', () => {
  it('have the same keys in every language', () => {
    expect(flattenKeys(ru.translation)).toEqual(flattenKeys(en.translation));
  });
});
