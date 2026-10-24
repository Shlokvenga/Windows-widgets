/* Shared setup for every widget page: theme, lock state and small helpers. */

async function setupWidget(name) {
  const init = await window.widgets.init(name);
  const root = document.documentElement.style;
  const theme = init.theme || {};
  if (theme.accent) root.setProperty('--accent', theme.accent);
  if (theme.background) root.setProperty('--bg', theme.background);
  if (theme.text) root.setProperty('--text', theme.text);
  if (theme.radius != null) root.setProperty('--radius', `${theme.radius}px`);

  document.body.classList.toggle('locked', init.locked);
  window.widgets.onLocked((locked) => document.body.classList.toggle('locked', locked));
  return init.settings || {};
}

function $(selector) {
  return document.querySelector(selector);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
