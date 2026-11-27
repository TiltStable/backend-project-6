// @ts-check

import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import en from '../server/locales/en.js';
import ru from '../server/locales/ru.js';

const root = process.cwd();
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
const toPosixPath = (fullPath) => path.relative(root, fullPath).split(path.sep).join('/');
const templates = () =>
  walk(path.join(root, 'server', 'views'))
    .filter((file) => file.endsWith('.eta'))
    .map((file) => [file, fs.readFileSync(file, 'utf-8')]);

// Everything outside Eta blocks and tags is a text node rendered to the user.
const textNodes = (template) => template.replace(/<%[\s\S]*?%>/g, '').replace(/<[^>]*>/g, '');

describe('template texts', () => {
  it('come from i18next, not from hardcoded text nodes', () => {
    const hardcoded = templates()
      .filter(([, template]) => /[A-Za-zА-Яа-яЁё]/.test(textNodes(template)))
      .map(([file]) => toPosixPath(file));
    expect(hardcoded).toEqual([]);
  });

  it('have a label translation for every form field', () => {
    // A field without a translation would render the raw key, e.g. "attributes.firstName".
    const fieldNames = templates().flatMap(([, template]) =>
      [...template.matchAll(/propertyName:\s*'([^']+)'/g)].map(([, name]) => name),
    );
    expect(fieldNames.length).toBeGreaterThan(0);

    const withoutLabel = fieldNames.filter(
      (name) => !en.translation.attributes[name] || !ru.translation.attributes[name],
    );
    expect(withoutLabel).toEqual([]);
  });

  it('are translated per request: no global i18next.t outside the localization setup', () => {
    const offenders = [
      ...walk(path.join(root, 'server', 'routes')),
      ...walk(path.join(root, 'server', 'lib')),
    ]
      .filter((file) => file.endsWith('.js'))
      .filter((file) => fs.readFileSync(file, 'utf-8').includes('i18next.t('))
      .map(toPosixPath);
    expect(offenders).toEqual([]);
    expect(
      fs.readFileSync(path.join(root, 'server', 'helpers', 'index.js'), 'utf-8'),
    ).not.toContain('i18next');
  });
});
