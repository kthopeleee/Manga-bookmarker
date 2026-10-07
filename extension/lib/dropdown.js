// The library website's dropdown (web/src/components/ui.jsx), without React: the list opens
// attached under the button, with a tick on the current choice. Keyboard works like a native
// select: arrows to move, Enter or Space to pick, Escape to close, a letter to jump.
// Styles: popup/dropdown.css.
//
//   const status = createDropdown({ label: 'Reading status', options: [{ id, label }], value, onChange });
//   parent.append(status.element);  status.value = 'reading';  // setting value doesn't call onChange

const SVG = 'http://www.w3.org/2000/svg';
let counter = 0;

function icon(className, d) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

export function createDropdown({ options, value, label, onChange }) {
  const id = `dropdown-${++counter}`;
  const indexOf = (v) => Math.max(0, options.findIndex((o) => o.id === v));
  let selected = indexOf(value);
  let active = selected;
  let menu = null;

  const root = document.createElement('div');
  root.className = 'dropdown';

  const trigger = document.createElement('div');
  trigger.className = 'dropdown__trigger';
  trigger.tabIndex = 0;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${id}-list`);

  // Every label is stacked invisibly underneath so the button is as wide as the longest one.
  const valueBox = document.createElement('span');
  valueBox.className = 'dropdown__value';
  for (const o of options) {
    const sizer = document.createElement('span');
    sizer.className = 'dropdown__sizer';
    sizer.setAttribute('aria-hidden', 'true');
    sizer.textContent = o.label;
    valueBox.append(sizer);
  }
  const current = document.createElement('span');
  valueBox.append(current);
  trigger.append(valueBox, icon('dropdown__chevron', 'M4 6l4 4 4-4'));
  root.append(trigger);

  const render = () => {
    current.textContent = options[selected].label;
    if (!menu) return;
    [...menu.children].forEach((li, i) => {
      li.classList.toggle('dropdown__option--active', i === active);
      li.setAttribute('aria-selected', String(i === selected));
      li.querySelector('.dropdown__check')?.remove();
      if (i === selected) li.append(icon('dropdown__check', 'M3.5 8.5l3 3 6-7'));
    });
    trigger.setAttribute('aria-activedescendant', `${id}-${active}`);
    menu.children[active]?.scrollIntoView({ block: 'nearest' });
  };

  const onOutside = (e) => {
    if (!root.contains(e.target)) close();
  };

  function open() {
    if (menu) return;
    active = selected;
    menu = document.createElement('ul');
    menu.className = 'dropdown__menu';
    menu.id = `${id}-list`;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', label);
    options.forEach((o, i) => {
      const li = document.createElement('li');
      li.id = `${id}-${i}`;
      li.className = 'dropdown__option';
      li.setAttribute('role', 'option');
      li.textContent = o.label;
      li.addEventListener('pointerenter', () => {
        active = i;
        render();
      });
      li.addEventListener('click', () => choose(i));
      menu.append(li);
    });
    root.append(menu);
    root.classList.add('dropdown--open');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside);
    render();
  }

  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    root.classList.remove('dropdown--open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', onOutside);
  }

  function choose(i) {
    const changed = i !== selected;
    selected = i;
    close();
    render();
    if (changed) onChange(options[i].id);
  }

  trigger.addEventListener('click', () => (menu ? close() : open()));
  trigger.addEventListener('keydown', (e) => {
    const last = options.length - 1;
    if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      // Jump to the next option starting with that letter.
      const from = menu ? active : selected;
      for (let step = 1; step <= options.length; step++) {
        const i = (from + step) % options.length;
        if (options[i].label.toLowerCase().startsWith(e.key.toLowerCase())) {
          if (menu) {
            active = i;
            render();
          } else choose(i);
          break;
        }
      }
      return;
    }
    if (!menu) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        open();
      }
      return;
    }
    const moves = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      active = moves[e.key];
      render();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the list, not the popup
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  });

  render();
  return {
    element: root,
    get value() {
      return options[selected].id;
    },
    set value(v) {
      selected = indexOf(v);
      render();
    },
  };
}
