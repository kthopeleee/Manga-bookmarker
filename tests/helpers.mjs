import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ADAPTER_FILES = [
  'adapters/_util.js',
  'adapters/mangago.js',
  'adapters/comix.js',
  'adapters/mangadex.js',
  'adapters/novelupdates.js',
  'adapters/asura.js',
  'adapters/wp-manga.js',
  'adapters/generic.js',
  'content/scrape.js',
];

/** Load the adapter scripts into a fresh sandbox, the way the extension injects them into a page. */
export function loadAdapters() {
  const sandbox = vm.createContext({ URL, console, setTimeout });
  for (const file of ADAPTER_FILES) {
    const code = fs.readFileSync(path.join(root, 'extension', file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox;
}

export function fixtureDoc(name) {
  const html = fs.readFileSync(path.join(root, 'tests', 'fixtures', name), 'utf8');
  return parseHTML(html).document;
}

export function htmlDoc(html) {
  return parseHTML(html).document;
}

/**
 * Run the page scraper. Results are copied out of the vm sandbox with JSON so that
 * deepStrictEqual compares plain objects from this realm.
 */
export async function scrape(sandbox, doc, href, env = {}) {
  const result = await sandbox.MB_RUN_SCRAPE(doc, new URL(href), env);
  return JSON.parse(JSON.stringify(result));
}
