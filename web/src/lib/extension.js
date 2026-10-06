// Talks to the Manga Bookmarker extension through content/library-bridge.js, which the extension
// runs on this site once it's set as the library website in the extension's settings.
import { useEffect, useState } from 'react';

function extensionAvailable() {
  return document.documentElement.hasAttribute('data-manga-bookmarker');
}

/** True once the extension's bridge is on this page. It can arrive after the app has rendered. */
export function useExtensionAvailable() {
  const [available, setAvailable] = useState(extensionAvailable);
  useEffect(() => {
    if (available) return undefined;
    if (extensionAvailable()) {
      setAvailable(true);
      return undefined;
    }
    const onMessage = (e) => {
      if (e.source === window && e.data && e.data.type === 'manga-bookmarker:ready') setAvailable(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [available]);
  return available;
}

/**
 * Ask the extension to open a series link in a background tab and read it.
 * Resolves with { fields, cover: { base64, type } | null, lastReadHint }.
 */
export function readLinkWithExtension(url, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      done();
      reject(new Error("The extension didn't answer. Try again, or fill it in by hand."));
    }, timeoutMs);
    function onMessage(e) {
      const msg = e.data;
      if (e.source !== window || !msg || msg.type !== 'manga-bookmarker:read-link-result' || msg.id !== id) return;
      done();
      if (msg.ok) resolve(msg);
      else reject(new Error(msg.error || "Couldn't read that link."));
    }
    function done() {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'manga-bookmarker:read-link', id, url }, location.origin);
  });
}
