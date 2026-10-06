import { useState } from 'react';
import { GitHubStore } from '@shared/github-store.js';

export function SettingsPage({ settings, onSave, onForget, library, connected }) {
  const [form, setForm] = useState(settings);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState({ text: '', kind: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus({ text: 'Unlocking…', kind: '' });
    try {
      const store = new GitHubStore(form);
      const info = await store.testConnection();
      if (!info.hasLibrary) await store.initLibrary();
      if (!info.private) {
        setStatus({ text: `Warning: ${info.fullName} is public, so anyone can read your library. Make it private on GitHub.`, kind: 'error' });
      }
      onSave(form, remember);
    } catch (err) {
      const text =
        err.status === 401 || err.status === 404
          ? "That key didn't work. Check it was copied completely, hasn't expired, and has access to the data repo."
          : err.message;
      setStatus({ text, kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manga-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const repoFields = (
    <>
      <label className="field">
        <span className="field__label">GitHub username</span>
        <input required value={form.owner} onChange={set('owner')} autoComplete="username" />
      </label>
      <label className="field">
        <span className="field__label">Data repo</span>
        <input required value={form.repo} onChange={set('repo')} />
      </label>
    </>
  );

  return (
    <div className="settings">
      <div className="settings__card">
        <div className="settings__brand">
          <img src="./favicon.svg" alt="" width="34" height="34" />
          <h1>{connected ? 'Settings' : 'Manga Shelf'}</h1>
        </div>
        <p className="muted">
          {connected
            ? 'This browser is unlocked. The key is stored only here and is sent only to GitHub.'
            : 'This shelf is private. Enter your key to open it.'}
        </p>

        <form onSubmit={submit} className="settings__form">
          <label className="field">
            <span className="field__label">Key</span>
            <input
              required
              autoFocus={!connected}
              type="password"
              value={form.token}
              onChange={set('token')}
              autoComplete="current-password"
              placeholder="github_pat_…"
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember on this device <span className="muted">(untick on a shared computer)</span>
          </label>

          {connected ? (
            repoFields
          ) : (
            <details className="repo-details">
              <summary>
                Library: {form.owner}/{form.repo}
              </summary>
              {repoFields}
            </details>
          )}

          <div className="settings__actions">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {connected ? 'Save' : 'Unlock'}
            </button>
            {connected && (
              <a className="btn" href="#/manga">
                Back to library
              </a>
            )}
          </div>
          {status.text && (
            <p className={`status status--${status.kind}`} role="status">
              {status.text}
            </p>
          )}
        </form>

        {connected && (
          <div className="settings__more">
            <button type="button" className="btn btn--small" onClick={exportJson} disabled={!library}>
              Download a backup (JSON)
            </button>
            <button
              type="button"
              className="btn btn--small btn--danger"
              onClick={() => {
                if (window.confirm('Lock this browser? The key is removed from this device. Your library on GitHub is not affected.')) onForget();
              }}
            >
              Lock this device
            </button>
          </div>
        )}

        <details className="help">
          <summary>Where do I get a key?</summary>
          <ol>
            <li>
              Open{' '}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
                GitHub → Fine-grained tokens → Generate new token
              </a>
              .
            </li>
            <li>
              Repository access: <strong>Only select repositories</strong> → <code>{form.repo}</code>.
            </li>
            <li>
              Repository permissions → <strong>Contents: Read and write</strong>.
            </li>
            <li>Generate it, then paste it here and in the browser extension's settings. Keep it like a password.</li>
          </ol>
        </details>
      </div>
    </div>
  );
}
