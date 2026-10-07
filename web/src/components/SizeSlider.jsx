// The slider at the bottom of the board that sets how big the books are. It sets --book-size, which the
// board's card width reads (styles.css). Double-click the slider to go back to the usual size.
import './SizeSlider.css';

export const BOOK_SIZE = { min: 56, max: 240, step: 4 };
const NUDGE = 16; // the small and big book buttons

/** The usual size when the user hasn't picked one: smaller on phones, like the board's own default. */
export function defaultBookSize() {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 860px)').matches ? 68 : 72;
}

const clamp = (n) => Math.min(BOOK_SIZE.max, Math.max(BOOK_SIZE.min, n));

function BookIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 1.5h8.5v13H4a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 4 1.5z" />
      <path d="M2.5 12.5A1.5 1.5 0 0 1 4 11h8.5" />
    </svg>
  );
}

/** value: the chosen width in px, or null for the usual size. onChange(null) goes back to it. */
export function SizeSlider({ value, onChange }) {
  const current = value ?? defaultBookSize();
  return (
    <div className="sizer" role="group" aria-label="Book size">
      <button type="button" className="sizer__btn" onClick={() => onChange(clamp(current - NUDGE))} title="Smaller books" aria-label="Smaller books" disabled={current <= BOOK_SIZE.min}>
        <BookIcon size={12} />
      </button>
      <input
        type="range"
        className="sizer__range"
        min={BOOK_SIZE.min}
        max={BOOK_SIZE.max}
        step={BOOK_SIZE.step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(null)}
        aria-label="Book size"
        aria-valuetext={`${current} pixels wide`}
        title="Drag to make the books bigger or smaller. Double-click for the usual size."
      />
      <button type="button" className="sizer__btn" onClick={() => onChange(clamp(current + NUDGE))} title="Bigger books" aria-label="Bigger books" disabled={current >= BOOK_SIZE.max}>
        <BookIcon size={18} />
      </button>
    </div>
  );
}
