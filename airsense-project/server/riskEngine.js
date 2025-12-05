// riskEngine.js
// Simple utility functions for AQI, exposure, and risk scoring
const KB = require('./knowledgeBase');

function getMockAQI(city) {
  const base = { pm25: 80, pm10: 120, no2: 35, o3: 30, so2: 10, co: 0.7 };
  const cityFactor = city && city.toLowerCase().includes("delhi") ? 1.4 : 1.0;
  const randomJitter = () => Math.random() * 0.3 + 0.85;

  return {
    city: city || "Unknown",
    pm25: Math.round(base.pm25 * cityFactor * randomJitter()),
    pm10: Math.round(base.pm10 * cityFactor * randomJitter()),
    no2: Math.round(base.no2 * cityFactor * randomJitter()),
    o3: Math.round(base.o3 * cityFactor * randomJitter()),
    so2: Math.round(base.so2 * cityFactor * randomJitter()),
    co: parseFloat((base.co * cityFactor * randomJitter()).toFixed(2)),
    temp: Math.round(24 + Math.random() * 5),
    windSpeed: Math.round(3 + Math.random() * 15),
    humidity: Math.round(40 + Math.random() * 30)
  };
}

function getMockForecast(aqi) {
  const hours = [6, 9, 12, 15, 18, 21];
  return hours.map((h, idx) => {
    const factor = [0.7, 0.8, 1.0, 1.2, 1.3, 0.9][idx];
    return {
      hour: h,
      pm25: Math.round(aqi.pm25 * factor),
      pm10: Math.round(aqi.pm10 * factor),
      temp: aqi.temp + (idx > 2 ? -2 : 2)
    };
  });
}

function getVentilationAdvice(aqi) {
  if (aqi.windSpeed < 5 && aqi.pm25 > 80) {
    return {
      status: "Poor Ventilation",
      description: "Stagnant air is trapping pollutants near the ground.",
      color: "text-red-600 bg-red-50 border-red-100"
    };
  }
  if (aqi.windSpeed > 15) {
    return {
      status: "Good Ventilation",
      description: "Breezy conditions are helping disperse pollutants.",
      color: "text-emerald-600 bg-emerald-50 border-emerald-100"
    };
  }
  return {
    status: "Moderate Ventilation",
    description: "Standard airflow. Pollution levels are stable.",
    color: "text-blue-600 bg-blue-50 border-blue-100"
  };
}

function computeRiskScore(aqi, profile, symptomFactor = 1.0) {
  const baseAQI = aqi.pm25;
  const sensitivityFactor =
    profile.sensitivity === "high" ? 1.4 :
    profile.sensitivity === "medium" ? 1.1 :
    1.0;
  const conditionFactor = (profile.conditions || []).length > 0 ? 1.3 : 1.0;
  const feedbackAdjustment = symptomFactor;
  const adjusted = baseAQI * sensitivityFactor * conditionFactor * feedbackAdjustment;

  let score = (adjusted / 250) * 100;
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  let level = "Low";
  let advice = "Air quality is acceptable for most people.";

  if (score >= 30 && score < 60) {
    level = "Moderate";
    advice = "Sensitive users should be a bit cautious.";
  } else if (score >= 60 && score < 80) {
    level = "High";
    advice = "Limit outdoor exertion. Keep medication handy.";
  } else if (score >= 80) {
    level = "Very High";
    advice = "Avoid outdoor activity. Pollutants may trigger symptoms.";
  }

  return { score: Math.round(score), level, advice, feedbackUsed: feedbackAdjustment > 1.0 };
}

function suggestActivityWindow(forecast) {
  let best = forecast[0];
  forecast.forEach(slot => {
    if (slot.pm25 < best.pm25) best = slot;
  });
  return {
    windowLabel: `${best.hour}:00 - ${best.hour + 2}:00`,
    reason: "Lowest predicted particulate matter in the next few hours.",
    pm25: best.pm25,
    allSlots: forecast
  };
}

function getRouteOptions(aqi, profile) {
  const baseExposure = aqi.pm25;
  const sensitivityFactor =
    profile.sensitivity === "high" ? 1.4 :
    profile.sensitivity === "medium" ? 1.1 : 1.0;

  return [
    {
      id: "fastest",
      label: "Fastest Route",
      durationMinutes: 30,
      exposureIndex: Math.round(baseExposure * sensitivityFactor * 1.2),
      description: "High traffic density (Main Highway)",
      color: "#ef4444"
    },
    {
      id: "healthiest",
      label: "Green Route",
      durationMinutes: 42,
      exposureIndex: Math.round(baseExposure * sensitivityFactor * 0.65),
      description: "Low traffic, park adjacencies",
      color: "#10b981"
    },
    {
      id: "balanced",
      label: "Balanced Route",
      durationMinutes: 35,
      exposureIndex: Math.round(baseExposure * sensitivityFactor * 0.9),
      description: "Residential streets",
      color: "#3b82f6"
    }
  ];
}

function simpleChatReply(message, risk, activityWindow, routes, ventAdvice, aqi) {
  const text = message.toLowerCase();

  const routeMatch = text.match(/(?:from\s+)?([a-z]+)\s+to\s+([a-z]+)/i);
  if (routeMatch && !text.includes("office") && !text.includes("home")) {
    const fromCity = routeMatch[1];
    const toCity = routeMatch[2];
    const from = fromCity.charAt(0).toUpperCase() + fromCity.slice(1);
    const to = toCity.charAt(0).toUpperCase() + toCity.slice(1);

    if ((from === "Kolkata" && to === "Delhi") || (from === "Delhi" && to === "Kolkata")) {
      return {
        type: 'text',
        text: `For the best route from ${from} to ${to} considering road conditions and air quality zones, I recommend: \n\n${from} ➝ Dhanbad ➝ Gaya ➝ Varanasi ➝ Prayagraj (Allahabad) ➝ Kanpur ➝ Agra ➝ ${to}.\n\nThis route (NH19) avoids the heavy industrial congestion of the alternative highways.`
      };
    }

    return {
      type: 'text',
      text: `Traveling from ${from} to ${to}? The optimal route is via the National Highway network. Ensure you check AQI levels at major stopovers before starting.`
    };
  }

  if (text.includes("fever") || (text.includes("temperature") && text.includes("high"))) {
    return { type: 'text', text: "Dr. AirSense: If you have a fever, stay hydrated and rest. For mild fever, you can use a cool compress. Paracetamol is commonly used, but please consult a real doctor if it exceeds 102°F or persists for more than 3 days." };
  }
  if (text.includes("cough") || text.includes("cold") || text.includes("throat")) {
    return { type: 'text', text: `Dr. AirSense: For a cough or cold, try steam inhalation and warm ginger-honey tea. Avoid cold water. Since the air quality is ${risk.level}, wear a mask if you must go outside to prevent aggravating your throat.` };
  }
  if (text.includes("headache")) {
    return { type: 'text', text: `Dr. AirSense: Headaches can often be triggered by pollution or dehydration. Drink plenty of water and rest in a dark, quiet room. If the AQI is high (${aqi.pm25}), ensure your indoor air is purified.` };
  }
  if (text.includes("asthma") || text.includes("breathing")) {
    return { type: 'text', text: `Dr. AirSense: Please keep your rescue inhaler handy. With a risk score of ${risk.score}, avoid outdoor exertion. If you experience wheezing, move to a cleaner environment immediately.` };
  }

  if (text.includes("weather") || text.includes("rain") || text.includes("sunny")) {
    const isCurrentLoc = text.includes(aqi.city.toLowerCase()) || !text.match(/in\s+([a-z]+)/i);
    if (isCurrentLoc) {
      return {
        type: 'text',
        text: `Current weather in ${aqi.city}: ${aqi.temp}°C, humidity ${aqi.humidity}%. Wind speed is ${aqi.windSpeed} km/h.`
      };
    } else {
      const cityMatch = text.match(/in\s+([a-z]+)/i);
      const otherCity = cityMatch ? cityMatch[1] : "that city";
      return { type: 'text', text: `Weather in ${otherCity}: It is likely around ${Math.round(aqi.temp - 2)}°C with moderate cloud cover.` };
    }
  }

  // Knowledge base answers: match keywords and render templated responses with context
  for (const entry of KB) {
    if (entry.keywords.some(k => text.includes(k))) {
      let answer = entry.answer
        .replace('{{riskScore}}', String(risk.score))
        .replace('{{riskLevel}}', String(risk.level))
        .replace('{{bestWindow}}', String(activityWindow.windowLabel))
        .replace('{{bestPm25}}', String(activityWindow.pm25));
      return { type: 'text', text: answer };
    }
  }

  if (text.includes("route") || text.includes("map") || text.includes("commute") || text.includes("office")) {
    const bestRoute = routes.find(r => r.id === 'healthiest') || routes[0];
    return { type: 'map', text: `For your local commute, I've calculated a health-aware route. The "Green Route" reduces your pollution exposure by ~40% compared to the main highway.`, data: routes };
  }

  if (text.includes("ventilation") || text.includes("window") || text.includes("air")) {
    return { type: 'text', text: `Dr. AirSense Advice: ${ventAdvice.status}. ${ventAdvice.description}` };
  }

  if (text.includes("run") || text.includes("jog") || text.includes("exercise")) {
    return { type: 'text', text: `Your personalized risk is ${risk.score} (${risk.level}). Best time to exercise: ${activityWindow.windowLabel} when PM2.5 is lowest (${activityWindow.pm25} µg/m³).` };
  }

  if (text.includes("hello") || text.includes("hi") || text.includes("hey")) {
    return { type: 'text', text: "Hello! I am Dr. AirSense, your personal health and environment assistant. I can help with medical advice, weather updates, detailed travel routes, or air quality analysis. How can I help you today?" };
  }

  return { type: 'text', text: `I’m specialized in health and environment. For "${message}", here’s a general approach:
1) Clarify if this is about health, environment, or safety.
2) Check credible sources (WHO/CDC/local advisories).
3) Consider your personal risk (current score ${risk.score} – ${risk.level}).
4) If urgent symptoms occur, seek medical care.
You can also ask: "what is PM2.5", "best mask", "improve indoor air", or "best time to run".` };
}

module.exports = {
  getMockAQI,
  getMockForecast,
  getVentilationAdvice,
  computeRiskScore,
  suggestActivityWindow,
  getRouteOptions,
  simpleChatReply
};
