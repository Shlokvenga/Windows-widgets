let settings = {};
let invite = null;

function renderMembers(members) {
  const list = $('#members');
  list.replaceChildren();
  const max = settings.maxMembers || 8;
  for (const m of members.slice(0, max)) {
    const item = el('li', 'member');
    const avatar = el('div', 'avatar', (m.name || '?').charAt(0).toUpperCase());
    if (m.avatar) {
      const img = el('img');
      img.alt = '';
      img.onerror = () => img.remove();
      img.src = m.avatar;
      avatar.append(img);
    }
    avatar.append(el('span', `dot ${m.status}`));

    const text = el('div', 'member-text');
    text.append(el('div', 'member-name ellipsis', m.name));
    if (m.game) text.append(el('div', 'member-game muted ellipsis', `Playing ${m.game}`));
    item.append(avatar, text);
    list.append(item);
  }
  if (members.length > max) {
    list.append(el('li', 'muted', `+ ${members.length - max} more`));
  }
  $('#members-section').classList.toggle('hidden', members.length === 0);
}

function renderVoice(channels) {
  const container = $('#voice');
  container.replaceChildren();
  for (const c of channels) {
    const box = el('div', 'voice-channel');
    box.append(el('div', 'name ellipsis', `🔊 ${c.name}`));
    box.append(el('div', 'muted ellipsis', c.members.join(', ')));
    container.append(box);
  }
  $('#voice-section').classList.toggle('hidden', channels.length === 0);
}

async function refresh() {
  const data = await window.widgets.discord.get();
  if (data.error) {
    $('#message').textContent = data.message;
    $('#message').classList.remove('hidden');
    $('#voice-section').classList.add('hidden');
    $('#members-section').classList.add('hidden');
    return;
  }

  $('#message').classList.add('hidden');
  $('#server').textContent = data.name;
  $('#online').textContent = `${data.onlineCount} online`;
  invite = data.invite;
  $('#join').classList.toggle('hidden', !invite);
  renderVoice(data.voiceChannels);
  renderMembers(data.members);
}

(async () => {
  settings = await setupWidget('discord');
  $('#open').addEventListener('click', () => window.widgets.openExternal('discord://'));
  $('#join').addEventListener('click', () => invite && window.widgets.openExternal(invite));
  $('#refresh').addEventListener('click', refresh);

  await refresh();
  const seconds = Math.max(30, Number(settings.refreshSeconds) || 60);
  setInterval(refresh, seconds * 1000);
})();
