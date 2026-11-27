// @ts-check

import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
const toPosixPath = (fullPath) => path.relative(root, fullPath).split(path.sep).join('/');

// Styles are built from the template sources. A broken link between the places checked below
// keeps the build green and still produces main.css, but ships pages without styles.
describe('style pipeline', () => {
  it('has one stylesheet source and no hand-written styles', () => {
    const stylesheets = walk(path.join(root, 'assets'))
      .filter((file) => file.endsWith('.css'))
      .map(toPosixPath);
    expect(stylesheets).toEqual(['assets/css/source.css']);

    const customStyles = walk(path.join(root, 'server', 'views'))
      .filter((file) => file.endsWith('.eta'))
      .filter((file) => /\sstyle\s*=|<style[\s>]/i.test(fs.readFileSync(file, 'utf-8')))
      .map(toPosixPath);
    expect(customStyles).toEqual([]);
  });

  it('keeps the linked places in sync', () => {
    expect(read('assets', 'css', 'source.css')).toContain('@source "../../server"');
    expect(read('assets', 'css', 'source.css')).toContain('@plugin "@tailwindcss/forms"');
    expect(read('vite.config.js')).toContain("outDir: 'dist'");
    expect(read('vite.config.js')).toContain("assetFileNames: 'main.css'");
    expect(read('server', 'views', 'layouts', 'application.eta')).toContain(
      "it.assetPath('main.css')",
    );
    expect(read('server', 'plugin.js')).toContain("path.join(__dirname, '..', 'dist')");
    expect(read('server', 'plugin.js')).toContain("prefix: '/assets/'");
  });

  it('builds the classes used in templates and the form plugin styles', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-styles-'));
    let css = '';
    try {
      execFileSync(
        process.execPath,
        [
          path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
          'build',
          '--outDir',
          outDir,
          '--emptyOutDir',
          '--logLevel',
          'error',
        ],
        { cwd: root, stdio: 'pipe', timeout: 120_000 },
      );
      css = fs.readFileSync(path.join(outDir, 'main.css'), 'utf-8');
    } finally {
      // Retries keep a locked directory on Windows from hiding the original failure.
      fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }

    expect(css).toMatch(/\.text-4xl\{/);
    expect(css).toMatch(/input:where\(\[type=text\]\)/);
    expect(css).toMatch(/input:where\(\[type=password\]\)/);
  }, 180_000);
});
