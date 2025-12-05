// Live data sources with graceful fallback to riskEngine mocks
// Requires Node 18+ for built-in fetch

const { getMockAQI, getMockForecast } = require('./riskEngine');

async function geocodeCity(city) {
  // Use Open-Meteo geocoding
  try {
    const resp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    const json = await resp.json();
    const item = json?.results?.[0];
    if (!item) return null;
    return { lat: item.latitude, lon: item.longitude, name: item.name };
  } catch { return null; }
}

async function fetchWeather(lat, lon) {
  // Open-Meteo current weather
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`;
    const resp = await fetch(url);
    const json = await resp.json();
    const cur = json?.current || {};
    return {
      temp: Math.round(cur.temperature_2m ?? 24),
      windSpeed: Math.round(cur.wind_speed_10m ?? 5),
      humidity: Math.round(cur.relative_humidity_2m ?? 50)
    };
  } catch { return { temp: 24, windSpeed: 5, humidity: 50 }; }
}

async function fetchAQI(city) {
  // OpenAQ latest PM2.5/PM10; fallback to mock
  try {
    const resp = await fetch(`https://api.openaq.org/v2/latest?limit=1&page=1&offset=0&sort=desc&radius=1000&country_id=&city=${encodeURIComponent(city)}&order_by=datetime`);
    const json = await resp.json();
    const m = json?.results?.[0]?.measurements || json?.results?.[0]?.parameters || []; // API variants
    const getVal = (key) => {
      const entry = (json?.results?.[0]?.measurements || []).find((e) => (e.parameter || e.parameterId) === key) || (json?.results?.[0]?.parameters || []).find((e) => e.parameter === key);
      return entry?.value;
    };
    const pm25 = Math.round(getVal('pm25') ?? 0) || null;
    const pm10 = Math.round(getVal('pm10') ?? 0) || null;
    if (pm25 === null && pm10 === null) return null;
    return { pm25, pm10 };
  } catch { return null; }
}

async function getLiveAQI(city) {
  const geo = await geocodeCity(city);
  if (!geo) return getMockAQI(city);
  const weather = await fetchWeather(geo.lat, geo.lon);
  const aqi = await fetchAQI(city);
  if (!aqi) {
    const mock = getMockAQI(city);
    return { ...mock, temp: weather.temp, windSpeed: weather.windSpeed, humidity: weather.humidity };
  }
  const base = getMockAQI(city); // for other gases
  return {
    city,
    pm25: aqi.pm25 ?? base.pm25,
    pm10: aqi.pm10 ?? base.pm10,
    no2: base.no2,
    o3: base.o3,
    so2: base.so2,
    co: base.co,
    temp: weather.temp,
    windSpeed: weather.windSpeed,
    humidity: weather.humidity
  };
}

async function getLiveForecast(aqi) {
  // Use mock forecast scaled from current PM; Open-Meteo hourly could be added later
  return getMockForecast(aqi);
}

module.exports = { getLiveAQI, getLiveForecast };
