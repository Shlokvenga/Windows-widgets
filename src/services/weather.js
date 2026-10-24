/** Weather from Open-Meteo (free, no API key). */

const geocodeCache = new Map();

async function geocode(city) {
  if (geocodeCache.has(city)) return geocodeCache.get(city);
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const place = data.results && data.results[0];
  if (!place) throw new Error(`Couldn't find "${city}"`);
  const result = { latitude: place.latitude, longitude: place.longitude, name: place.name };
  geocodeCache.set(city, result);
  return result;
}

async function fetchWeather(settings) {
  try {
    let place;
    if (typeof settings.latitude === 'number' && typeof settings.longitude === 'number') {
      place = { latitude: settings.latitude, longitude: settings.longitude, name: settings.city || '' };
    } else {
      place = await geocode(settings.city || 'London');
    }

    const fahrenheit = settings.units === 'fahrenheit';
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min',
      forecast_days: '1',
      timezone: 'auto',
      temperature_unit: fahrenheit ? 'fahrenheit' : 'celsius',
      wind_speed_unit: fahrenheit ? 'mph' : 'kmh'
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
    const data = await res.json();

    return {
      place: place.name,
      unit: fahrenheit ? '°F' : '°C',
      windUnit: fahrenheit ? 'mph' : 'km/h',
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      wind: data.current.wind_speed_10m,
      code: data.current.weather_code,
      isDay: data.current.is_day === 1,
      high: data.daily.temperature_2m_max[0],
      low: data.daily.temperature_2m_min[0]
    };
  } catch (err) {
    return { error: true, message: err.message || 'Weather unavailable' };
  }
}

module.exports = { fetchWeather };
