// Publishes the website: runs the tests, builds web/, and pushes the result to the gh-pages
// branch, which GitHub Pages serves at https://<user>.github.io/<repo>/.
//   npm run deploy:web
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const read = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

run('npm', ['test']);
run('npm', ['run', 'build:web']);

const dist = path.join(root, 'web', 'dist');
fs.writeFileSync(path.join(dist, '.nojekyll'), ''); // serve files as-is, no Jekyll processing

const remote = read('git', ['remote', 'get-url', 'origin']);
const source = read('git', ['rev-parse', '--short', 'HEAD']);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-shelf-pages-'));
try {
  fs.cpSync(dist, tmp, { recursive: true });
  run('git', ['init', '-q', '-b', 'gh-pages'], tmp);
  run('git', ['add', '-A'], tmp);
  run('git', ['commit', '-q', '-m', `Deploy website from ${source}`], tmp);
  try {
    // GIT_TERMINAL_PROMPT=0: fail instead of waiting for a password if git has no login.
    execFileSync('git', ['push', '-q', '-f', remote, 'gh-pages'], {
      cwd: tmp,
      stdio: 'inherit',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch {
    // No git credentials for GitHub: borrow the GitHub CLI's login for this one push.
    run('git', ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '-q', '-f', remote, 'gh-pages'], tmp);
  }
  console.log('Published. GitHub Pages updates within a minute or two.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
