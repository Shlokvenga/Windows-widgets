// WMO weather codes used by Open-Meteo.
const CONDITIONS = [
  [[0], 'Clear', '☀️', '🌙'],
  [[1], 'Mostly clear', '🌤️', '🌙'],
  [[2], 'Partly cloudy', '⛅', '☁️'],
  [[3], 'Overcast', '☁️', '☁️'],
  [[45, 48], 'Fog', '🌫️', '🌫️'],
  [[51, 53, 55, 56, 57], 'Drizzle', '🌦️', '🌧️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', '🌧️', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Snow', '🌨️', '🌨️'],
  [[95, 96, 99], 'Thunderstorm', '⛈️', '⛈️']
];

function describe(code, isDay) {
  const match = CONDITIONS.find(([codes]) => codes.includes(code));
  if (!match) return { text: 'Unknown', emoji: '🌡️' };
  return { text: match[1], emoji: isDay ? match[2] : match[3] };
}

async function update() {
  const w = await window.widgets.weather.get();
  if (w.error) {
    $('#condition').textContent = w.message;
    return;
  }
  const { text, emoji } = describe(w.code, w.isDay);
  const round = Math.round;
  $('#place').textContent = w.place;
  $('#condition').textContent = text;
  $('#emoji').textContent = emoji;
  $('#temp').textContent = `${round(w.temperature)}${w.unit}`;
  $('#range').textContent = `H ${round(w.high)}°  L ${round(w.low)}°`;
  $('#details').textContent =
    `Feels ${round(w.feelsLike)}°  ·  💧 ${w.humidity}%  ·  💨 ${round(w.wind)} ${w.windUnit}`;
}

(async () => {
  const settings = await setupWidget('weather');
  await update();
  const minutes = Math.max(5, Number(settings.refreshMinutes) || 15);
  setInterval(update, minutes * 60 * 1000);
})();
