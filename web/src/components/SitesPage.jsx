// #/sites: the sites the extension can read, what it does on each, and whether each site's
// series go to Manga or Light Novels. Drag a site between the two (or use its button).
import { useState } from 'react';
import { LIBRARIES, updateEntry } from '@shared/model.js';
import {
  FEATURES,
  SITES,
  OTHER_SITES,
  siteLibrary,
  setSiteLibrary,
  otherSavedSites,
  entriesToMove,
  sourceSite,
  featureOn,
  setFeatureOn,
} from '@shared/sites.js';
import { Modal } from './Modal.jsx';
import './SitesPage.css';

const FEATURE = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
const libLabel = (id) => LIBRARIES.find((l) => l.id === id).label;
const otherLib = (id) => (id === 'novel' ? 'manga' : 'novel');
const countText = (n) => `${n} series`;

function Features({ ids, library }) {
  return (
    <ul className="sitecard__features" aria-label="Works here">
      {ids.map((id) => {
        const off = !featureOn(library, id);
        return (
          <li key={id} className={off ? 'is-off' : ''} title={`${FEATURE[id].about}${off ? ' Turned off at the top of this page.' : ''}`}>
            {FEATURE[id].label}
            {off && ' (off)'}
          </li>
        );
      })}
    </ul>
  );
}

export function SitesPage({ library, mutate, notify, onClose }) {
  const [dragging, setDragging] = useState(null); // id of the site being dragged
  const [over, setOver] = useState(null); // section it's over
  const [offer, setOffer] = useState(null); // after a move: { name, lib, ids } of saved series to move too

  if (!library) {
    return (
      <Modal onClose={onClose} label="Sites" wide>
        <p className="muted">Loading your library…</p>
      </Modal>
    );
  }

  const savedFrom = new Map();
  for (const e of library.entries) {
    const id = sourceSite(e);
    if (id) savedFrom.set(id, (savedFrom.get(id) || 0) + 1);
  }
  // Sites without a reader of their own show up once something was saved from them or they were moved.
  const others = otherSavedSites(library);
  for (const id of Object.keys(library.siteLibraries || {})) {
    if (!SITES.some((s) => s.id === id) && !others.some((o) => o.id === id)) {
      others.push({ id, name: id, counts: { manga: 0, novel: 0 } });
    }
  }
  const cards = [
    ...SITES,
    ...others.map((o) => ({ id: o.id, name: o.name, library: o.counts.novel > o.counts.manga ? 'novel' : 'manga' })),
  ];
  const sectionOf = (card) => siteLibrary(library, card.id) || card.library;

  function move(card, lib) {
    if (sectionOf(card) === lib) return;
    const ids = entriesToMove(library, card.id, lib).map((e) => e.id);
    mutate((l) => setSiteLibrary(l, card.id, lib), `Sites: ${card.name} goes to ${libLabel(lib)}`).catch(() => {});
    notify(`New series from ${card.name} will go to ${libLabel(lib)}.`);
    setOffer(ids.length ? { name: card.name, lib, ids } : null);
  }

  function moveSaved() {
    const { name, lib, ids } = offer;
    setOffer(null);
    mutate((l) => {
      for (const id of ids) {
        // Folders belong to one section, so the series leaves its old ones.
        if (l.entries.some((e) => e.id === id)) updateEntry(l, id, { library: lib, folderIds: [] });
      }
      return l;
    }, `Move ${countText(ids.length)} from ${name} to ${libLabel(lib)}`).catch(() => {});
    notify(`Moved ${countText(ids.length)} from ${name} to ${libLabel(lib)}.`);
  }

  function toggle(feature, on) {
    mutate((l) => setFeatureOn(l, feature.id, on), `${feature.label}: ${on ? 'on' : 'off'}`).catch(() => {});
    notify(
      on
        ? `${feature.label} is on.`
        : `${feature.label} is off. Right-click a series page and choose “Save or update” to do it by hand.`,
    );
  }

  const drop = (lib) => (e) => {
    e.preventDefault();
    const card = cards.find((c) => c.id === dragging);
    setDragging(null);
    setOver(null);
    if (card) move(card, lib);
  };

  return (
    <Modal onClose={onClose} label="Sites" wide>
      <div className="sites">
        <h2>Sites</h2>
        <p className="muted sites__lead">
          The extension can read series from these sites. Drag a site to Manga or Light Novels to choose where the series you
          save from it go. A story can be both: link its manga and its light novel on either one’s page, and each keeps its own
          chapters.
        </p>

        <section className="sites__auto" aria-labelledby="sites-auto">
          <h3 id="sites-auto" className="sites__heading">
            When you visit a series you saved
          </h3>
          {FEATURES.filter((f) => f.toggle).map((f) => (
            <label key={f.id} className="switch">
              <input type="checkbox" role="switch" checked={featureOn(library, f.id)} onChange={(e) => toggle(f, e.target.checked)} />
              <span className="switch__track" aria-hidden="true" />
              <span>{f.toggle}</span>
            </label>
          ))}
          <p className="muted sites__auto-note">
            When these are off, the badge still tells you about new chapters. Right-click the page and choose “Save or update”
            to save them. Updating never makes a second copy and never removes your tags, genres or notes.
          </p>
        </section>

        {offer && (
          <div className="sites__offer" role="status">
            <span>
              {countText(offer.ids.length)} you saved from {offer.name} {offer.ids.length === 1 ? 'is' : 'are'} in{' '}
              {libLabel(otherLib(offer.lib))}. Move {offer.ids.length === 1 ? 'it' : 'them'} to {libLabel(offer.lib)} too?
            </span>
            <span className="sites__offer-actions">
              <button type="button" className="btn btn--small btn--primary" onClick={moveSaved}>
                Move {offer.ids.length === 1 ? 'it' : 'them'}
              </button>
              <button type="button" className="btn btn--small" onClick={() => setOffer(null)}>
                Leave {offer.ids.length === 1 ? 'it' : 'them'}
              </button>
            </span>
          </div>
        )}

        <div className="sites__columns">
          {LIBRARIES.map((l) => {
            const here = cards.filter((c) => sectionOf(c) === l.id);
            return (
              <section
                key={l.id}
                className={`sites__column ${over === l.id ? 'sites__column--over' : ''}`}
                aria-label={l.label}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (over !== l.id) setOver(l.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setOver(null);
                }}
                onDrop={drop(l.id)}
              >
                <h3 className="sites__heading">
                  {l.label} <span className="sites__count">{here.length}</span>
                </h3>
                {here.map((c) => (
                  <article
                    key={c.id}
                    className={`sitecard ${dragging === c.id ? 'sitecard--dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', c.name);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(c.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    <div className="sitecard__head">
                      <span className="sitecard__grip" aria-hidden="true">
                        ⠿
                      </span>
                      <span className="sitecard__name">{c.name}</span>
                      {c.hosts && <span className="sitecard__host">{c.hosts.join(', ')}</span>}
                      <button
                        type="button"
                        className="sitecard__move"
                        onClick={() => move(c, otherLib(l.id))}
                        title={`Series you save from ${c.name} will go to ${libLabel(otherLib(l.id))}`}
                      >
                        {l.id === 'manga' ? `To ${libLabel('novel')} →` : `← To ${libLabel('manga')}`}
                      </button>
                    </div>
                    {c.reads ? (
                      <p className="sitecard__reads">
                        <span className="sitecard__label">Reads</span> {c.reads.join(', ')}
                      </p>
                    ) : (
                      <p className="sitecard__reads">Read with the WordPress or link-preview reader below.</p>
                    )}
                    {c.features && <Features ids={c.features} library={library} />}
                    {savedFrom.get(c.id) > 0 && (
                      <p className="sitecard__saved">{countText(savedFrom.get(c.id))} saved from here</p>
                    )}
                  </article>
                ))}
                {here.length === 0 && <p className="sites__empty">Drag a site here</p>}
              </section>
            );
          })}
        </div>

        <h3 className="sites__subhead">Also works on</h3>
        <div className="sites__others">
          {OTHER_SITES.map((o) => (
            <article key={o.id} className="sitecard sitecard--static">
              <div className="sitecard__head">
                <span className="sitecard__name">{o.name}</span>
              </div>
              <p className="sitecard__reads">{o.about}</p>
              <p className="sitecard__reads">
                <span className="sitecard__label">Reads</span> {o.reads.join(', ')}
              </p>
              <Features ids={o.features} library={library} />
            </article>
          ))}
        </div>

        <h3 className="sites__subhead">What each feature does</h3>
        <dl className="sites__legend">
          {FEATURES.map((f) => (
            <div key={f.id}>
              <dt>{f.label}</dt>
              <dd>{f.about}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
