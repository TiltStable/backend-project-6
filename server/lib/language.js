// @ts-check

export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_COOKIE = 'lang';

// Only a plain string is a language. A missing value or a repeated parameter is not.
const languageFrom = (source) => {
  const value = /** @type {Record<string, unknown> | undefined} */ (source)?.[LANGUAGE_COOKIE];
  return typeof value === 'string' ? value.toLowerCase() : undefined;
};

/**
 * Picks the interface language for a request: the query parameter wins over the cookie,
 * unsupported values are ignored. `remember` tells the caller to store the choice.
 * @param {{ query?: unknown, cookies?: unknown }} sources
 * @param {string[]} supported
 * @returns {{ language: string, remember: boolean }}
 */
export const resolveLanguage = ({ query, cookies } = {}, supported) => {
  const requested = languageFrom(query);
  if (supported.includes(requested)) {
    return { language: requested, remember: true };
  }

  const saved = languageFrom(cookies);
  if (supported.includes(saved)) {
    return { language: saved, remember: false };
  }

  return { language: DEFAULT_LANGUAGE, remember: false };
};

/**
 * Languages are the ones that have translations. A misconfiguration must stop the server
 * instead of silently switching every user to the default language.
 * @param {Record<string, unknown>} resources
 * @returns {string[]}
 */
export const getSupportedLanguages = (resources) => {
  const supported = Object.keys(resources ?? {});
  if (!supported.includes(DEFAULT_LANGUAGE)) {
    throw new Error(`No translations for the default language: ${DEFAULT_LANGUAGE}`);
  }
  return supported;
};
