let state = { active: false };
let settings = {};
let tintedArt = null;

function currentPosition() {
  if (!state.active) return 0;
  let position = state.positionMs || 0;
  // Windows only reports position when it changes state, so extrapolate while playing.
  if (state.status === 'Playing' && state.updatedAtMs) {
    position += Date.now() - state.updatedAtMs;
  }
  return Math.min(position, state.durationMs || position);
}

function renderProgress() {
  const duration = state.durationMs || 0;
  const position = currentPosition();
  $('#elapsed').textContent = formatDuration(position);
  $('#duration').textContent = formatDuration(duration);
  $('#fill').style.width = duration > 0 ? `${(100 * position) / duration}%` : '0%';
}

function tintFromArt(src) {
  if (!settings.dynamicColor || src === tintedArt) return;
  tintedArt = src;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 8, 8);
    const pixels = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
    }
    const n = pixels.length / 4;
    // Darken so white text stays readable on any album cover.
    const k = 0.45;
    const color = `${Math.round((r / n) * k)}, ${Math.round((g / n) * k)}, ${Math.round((b / n) * k)}`;
    $('#card').style.background =
      `linear-gradient(135deg, rgba(${color}, 0.92), var(--bg) 85%)`;
  };
  img.src = src;
}

function render(next) {
  if (next.type === 'unsupported') {
    state = { active: false };
    $('#player').classList.add('idle');
    $('#title').textContent = 'Windows only';
    $('#artist').textContent = next.message;
    return;
  }
  if (next.type !== 'state') return;
  state = next;

  const player = $('#player');
  player.classList.toggle('idle', !state.active);
  if (!state.active) {
    $('#title').textContent = 'Nothing playing';
    $('#artist').textContent = 'Start something in Spotify';
    $('#art').classList.add('hidden');
    $('#art-placeholder').classList.remove('hidden');
    $('#card').style.background = '';
    tintedArt = null;
    return;
  }

  $('#title').textContent = state.title || 'Unknown title';
  $('#title').title = state.album ? `${state.title} — ${state.album}` : state.title;
  $('#artist').textContent = state.artist || '';

  if (state.art) {
    $('#art').src = state.art;
    $('#art').classList.remove('hidden');
    $('#art-placeholder').classList.add('hidden');
    tintFromArt(state.art);
  } else if ('art' in state) {
    // New track whose cover hasn't arrived yet: don't keep showing the old one.
    $('#art').classList.add('hidden');
    $('#art-placeholder').classList.remove('hidden');
  }

  const playing = state.status === 'Playing';
  $('.icon-play').classList.toggle('hidden', playing);
  $('.icon-pause').classList.toggle('hidden', !playing);
  $('#prev').disabled = state.canPrevious === false;
  $('#next').disabled = state.canNext === false;
  renderProgress();
}

(async () => {
  settings = await setupWidget('spotify');

  $('#playpause').addEventListener('click', () => window.widgets.media.command('playpause'));
  $('#next').addEventListener('click', () => window.widgets.media.command('next'));
  $('#prev').addEventListener('click', () => window.widgets.media.command('previous'));
  $('#title').addEventListener('click', () => window.widgets.openExternal('spotify:'));

  window.widgets.media.onUpdate(render);
  render(await window.widgets.media.get());
  // Make sure we get album art even if this page loaded after the track started.
  window.widgets.media.command('refresh');

  setInterval(() => {
    if (state.active && state.status === 'Playing') renderProgress();
  }, 500);
})();
