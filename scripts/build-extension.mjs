// Builds the extension for Firefox and Chrome into dist/firefox and dist/chrome.
// No bundling: files are copied as-is (plus shared/), so Mozilla's review sees the real source.
//   node scripts/build-extension.mjs           build both
//   node scripts/build-extension.mjs --zip     build and zip for upload
//   node scripts/build-extension.mjs --watch   rebuild on changes
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'extension');
const sharedDir = path.join(root, 'shared');
const distDir = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));

function manifestFor(target, base) {
  const m = structuredClone(base);
  if (target === 'firefox') {
    // Firefox runs background scripts as an event page rather than a service worker.
    m.background = { scripts: [base.background.service_worker], type: 'module' };
  } else {
    delete m.browser_specific_settings;
  }
  return m;
}

function build() {
  const base = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
  for (const target of ['firefox', 'chrome']) {
    const out = path.join(distDir, target);
    fs.rmSync(out, { recursive: true, force: true });
    fs.cpSync(srcDir, out, { recursive: true, filter: (p) => !p.endsWith('.DS_Store') });
    fs.cpSync(sharedDir, path.join(out, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifestFor(target, base), null, 2) + '\n');
  }
  console.log(`Built dist/firefox and dist/chrome (v${base.version})`);
  return base.version;
}

function zip(version) {
  for (const target of ['firefox', 'chrome']) {
    const file = path.join(distDir, `manga-bookmarker-${target}-${version}.zip`);
    fs.rmSync(file, { force: true });
    execFileSync('zip', ['-r', '-q', '-X', file, '.'], { cwd: path.join(distDir, target) });
    console.log(`Zipped ${path.relative(root, file)}`);
  }
}

const version = build();
if (args.has('--zip')) zip(version);

if (args.has('--watch')) {
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (err) {
        console.error(err.message);
      }
    }, 150);
  };
  fs.watch(srcDir, { recursive: true }, rebuild);
  fs.watch(sharedDir, { recursive: true }, rebuild);
  console.log('Watching extension/ and shared/ for changes…');
}
