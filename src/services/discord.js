/**
 * Discord's public server widget API. Works for any server where an admin has turned on
 * Server Settings → Widget → "Enable Server Widget". No login or bot token needed.
 */
async function fetchDiscordWidget(serverId) {
  const id = String(serverId || '').trim();
  if (!/^\d{15,22}$/.test(id)) {
    return { error: 'setup', message: 'Add your server ID to config.json (widgets.discord.serverId).' };
  }

  let res;
  try {
    res = await fetch(`https://discord.com/api/guilds/${id}/widget.json`);
  } catch {
    return { error: 'network', message: 'Could not reach Discord.' };
  }
  if (res.status === 403) {
    return { error: 'disabled', message: 'The server widget is turned off. Enable it in Server Settings → Widget.' };
  }
  if (!res.ok) return { error: 'http', message: `Discord returned ${res.status}.` };

  const data = await res.json();
  const channels = new Map((data.channels || []).map((c) => [c.id, { ...c, members: [] }]));
  for (const member of data.members || []) {
    if (member.channel_id && channels.has(member.channel_id)) {
      channels.get(member.channel_id).members.push(member);
    }
  }

  return {
    name: data.name,
    invite: data.instant_invite,
    onlineCount: data.presence_count,
    members: (data.members || []).map((m) => ({
      name: m.username,
      avatar: m.avatar_url,
      status: m.status,
      game: m.game && m.game.name,
      inVoice: Boolean(m.channel_id)
    })),
    voiceChannels: [...channels.values()]
      .filter((c) => c.members.length > 0)
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ name: c.name, members: c.members.map((m) => m.username) }))
  };
}

module.exports = { fetchDiscordWidget };
