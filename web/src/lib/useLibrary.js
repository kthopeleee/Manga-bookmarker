// Loads the library from GitHub and saves changes.
// Changes show immediately (optimistic), are saved one at a time, and each save re-applies the
// change to the latest copy on GitHub, so edits from the extension in the meantime aren't lost.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitHubStore } from '@shared/github-store.js';
import { normalizeLibrary } from '@shared/model.js';
import { isConfigured } from './settings.js';

function apply(mutator, lib) {
  try {
    return normalizeLibrary(mutator(structuredClone(lib)) || lib);
  } catch {
    return lib;
  }
}

export function useLibrary(settings, notify) {
  const [library, setLibrary] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | missing | error
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(0);
  const queue = useRef(Promise.resolve());
  const pending = useRef([]); // changes shown locally but not yet saved
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const store = useMemo(
    () => (isConfigured(settings) ? new GitHubStore(settings) : null),
    [settings.owner, settings.repo, settings.token], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const withPending = useCallback((lib) => pending.current.reduce((acc, op) => apply(op.mutator, acc), lib), []);

  const load = useCallback(async () => {
    if (!store) return;
    setStatus((s) => (s === 'ready' ? 'ready' : 'loading'));
    try {
      const lib = await store.loadLibrary();
      setLibrary(withPending(lib));
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (err.status === 404) setStatus('missing');
      else {
        setError(err);
        setStatus('error');
      }
    }
  }, [store, withPending]);

  useEffect(() => {
    setLibrary(null);
    setStatus(store ? 'loading' : 'idle');
    load();
  }, [store, load]);

  // Refresh when the tab becomes visible again, to pick up bookmarks saved from the extension.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pending.current.length === 0) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const mutate = useCallback(
    (mutator, message) => {
      if (!store) return Promise.reject(new Error('Not connected'));
      const op = { mutator };
      pending.current.push(op);
      setLibrary((cur) => (cur ? apply(mutator, cur) : cur));
      setSaving((n) => n + 1);

      const run = queue.current.then(async () => {
        try {
          const saved = await store.updateLibrary((lib) => op.mutator(lib), message);
          pending.current = pending.current.filter((p) => p !== op);
          setLibrary(withPending(saved));
        } catch (err) {
          pending.current = pending.current.filter((p) => p !== op);
          notifyRef.current?.(`Couldn't save: ${err.message}`, 'error');
          try {
            setLibrary(withPending(await store.loadLibrary()));
          } catch {
            /* keep what we have */
          }
          throw err;
        } finally {
          setSaving((n) => n - 1);
        }
      });
      queue.current = run.catch(() => {});
      return run;
    },
    [store, withPending],
  );

  const createLibrary = useCallback(async () => {
    await store.initLibrary();
    await load();
  }, [store, load]);

  return { library, status, error, saving, store, reload: load, mutate, createLibrary };
}
