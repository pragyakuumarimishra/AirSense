import React, { useState, useEffect, useRef } from 'react';
import { saveProfile as apiSaveProfile, getDashboard as apiGetDashboard, sendChat as apiSendChat, getApiBase, register as apiRegister, login as apiLogin, setToken } from './api';
import { 
  Wind, 
  Activity, 
  Map as MapIcon, 
  MessageCircle, 
  AlertTriangle, 
  RefreshCw, 
  Save, 
  User, 
  Navigation,
  Send,
  Lock,
  CheckCircle,
  Info,
  ThumbsUp,
  ThumbsDown,
  Stethoscope
} from 'lucide-react';

// Default: personal healthcare chatbot mode (hides routing/map UI)
// Now controlled via a user toggle in the UI

// ---------------------------------
// Safe storage helper (localStorage with fallback)
// ---------------------------------
const safeStorage = (() => {
  let memory = {};
  const supported = (() => {
    try {
      const k = '__airsense_test__';
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        return true;
      }
    } catch (e) {
      // no-op
    }
    return false;
  })();

  return {
    get(key, fallback = null) {
      try {
        if (supported) {
          const v = window.localStorage.getItem(key);
          return v !== null ? v : fallback;
        }
      } catch {}
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : fallback;
    },
    set(key, value) {
      try {
        if (supported) {
          window.localStorage.setItem(key, value);
          return;
        }
      } catch {}
      memory[key] = value;
    },
    remove(key) {
      try {
        if (supported) {
          window.localStorage.removeItem(key);
          return;
        }
      } catch {}
      delete memory[key];
    }
  };
})();

const getJSON = (key, def = {}) => {
  const raw = safeStorage.get(key, null);
  if (raw === null || raw === undefined) return def;
  try { return JSON.parse(raw); } catch { return def; }
};
const setJSON = (key, obj) => {
  try { safeStorage.set(key, JSON.stringify(obj)); } catch {}
};

// -------------------------------
// BACKEND SIMULATION (Risk Engine)
// -------------------------------
const RiskEngine = {
  getMockAQI: (city) => {
    const base = { pm25: 80, pm10: 120, no2: 35, o3: 30, so2: 10, co: 0.7 };
    const cityFactor = city && city.toLowerCase().includes("delhi") ? 1.4 : 1.0;
    const randomJitter = () => (Math.random() * 0.3 + 0.85);
    return {
      city: city || "Unknown",
      pm25: Math.round(base.pm25 * cityFactor * randomJitter()),
      pm10: Math.round(base.pm10 * cityFactor * randomJitter()),
      no2: Math.round(base.no2 * cityFactor * randomJitter()),
      o3: Math.round(base.o3 * cityFactor * randomJitter()),
      so2: Math.round(base.so2 * cityFactor * randomJitter()),
      co: parseFloat((base.co * cityFactor * randomJitter()).toFixed(2)),
      temp: Math.round(24 + (Math.random() * 5)),
      windSpeed: Math.round(3 + (Math.random() * 15)),
      humidity: Math.round(40 + (Math.random() * 30))
    };
  },
  getMockForecast: (aqi) => {
    const hours = [6, 9, 12, 15, 18, 21];
    return hours.map((h, idx) => {
      const factor = [0.7, 0.8, 1.0, 1.2, 1.3, 0.9][idx];
      return { hour: h, pm25: Math.round(aqi.pm25 * factor), pm10: Math.round(aqi.pm10 * factor), temp: aqi.temp + (idx > 2 ? -2 : 2) };
    });
  },
  getVentilationAdvice: (aqi) => {
    if (aqi.windSpeed < 5 && aqi.pm25 > 80) {
      return { status: "Poor Ventilation", description: "Stagnant air is trapping pollutants near the ground.", color: "text-red-600 bg-red-50 border-red-100" };
    }
    if (aqi.windSpeed > 15) {
      return { status: "Good Ventilation", description: "Breezy conditions are helping disperse pollutants.", color: "text-emerald-600 bg-emerald-50 border-emerald-100" };
    }
    return { status: "Moderate Ventilation", description: "Standard airflow. Pollution levels are stable.", color: "text-blue-600 bg-blue-50 border-blue-100" };
  },
  computeRiskScore: (aqi, profile, symptomFactor = 1.0) => {
    const baseAQI = aqi.pm25;
    const sensitivityFactor = profile.sensitivity === "high" ? 1.4 : profile.sensitivity === "medium" ? 1.1 : 1.0;
    const conditionFactor = (profile.conditions || []).length > 0 ? 1.3 : 1.0;
    const adjusted = baseAQI * sensitivityFactor * conditionFactor * symptomFactor;
    let score = (adjusted / 250) * 100; score = Math.max(0, Math.min(100, score));
    let level = "Low", advice = "Air quality is acceptable for most people.";
    if (score >= 30 && score < 60) { level = "Moderate"; advice = "Sensitive users should be a bit cautious."; }
    else if (score >= 60 && score < 80) { level = "High"; advice = "Limit outdoor exertion. Keep medication handy."; }
    else if (score >= 80) { level = "Very High"; advice = "Avoid outdoor activity. Pollutants may trigger symptoms."; }
    return { score: Math.round(score), level, advice, feedbackUsed: symptomFactor > 1.0 };
  },
  suggestActivityWindow: (forecast) => {
    let best = forecast[0];
    forecast.forEach(slot => { if (slot.pm25 < best.pm25) best = slot; });
    return { windowLabel: `${best.hour}:00 - ${best.hour + 2}:00`, reason: "Lowest predicted particulate matter in the next few hours.", pm25: best.pm25, allSlots: forecast };
  },
  getRouteOptions: (aqi, profile) => {
    const baseExposure = aqi.pm25;
    const sensitivityFactor = profile.sensitivity === "high" ? 1.4 : profile.sensitivity === "medium" ? 1.1 : 1.0;
    return [
      { id: "fastest", label: "Fastest Route", durationMinutes: 30, exposureIndex: Math.round(baseExposure * sensitivityFactor * 1.2), description: "High traffic density (Main Highway)", color: "#ef4444" },
      { id: "healthiest", label: "Green Route", durationMinutes: 42, exposureIndex: Math.round(baseExposure * sensitivityFactor * 0.65), description: "Low traffic, park adjacencies", color: "#10b981" },
      { id: "balanced", label: "Balanced Route", durationMinutes: 35, exposureIndex: Math.round(baseExposure * sensitivityFactor * 0.9), description: "Residential streets", color: "#3b82f6" }
    ];
  },
  simpleChatReply: (message, risk, activityWindow, routes, ventAdvice, aqi) => {
    const text = message.toLowerCase();
    const routeMatch = text.match(/(?:from\s+)?([a-z]+)\s+to\s+([a-z]+)/i);
    if (routeMatch && !text.includes("office") && !text.includes("home")) {
      const fromCity = routeMatch[1]; const toCity = routeMatch[2];
      const from = fromCity.charAt(0).toUpperCase() + fromCity.slice(1);
      const to = toCity.charAt(0).toUpperCase() + toCity.slice(1);
      if ((from === "Kolkata" && to === "Delhi") || (from === "Delhi" && to === "Kolkata")) {
        return { type: 'text', text: `For the best route from ${from} to ${to} considering road conditions and air quality zones, I recommend: \n\n${from} ➝ Dhanbad ➝ Gaya ➝ Varanasi ➝ Prayagraj (Allahabad) ➝ Kanpur ➝ Agra ➝ ${to}.\n\nThis route (NH19) avoids the heavy industrial congestion of the alternative highways.` };
      }
      return { type: 'text', text: `Traveling from ${from} to ${to}? The optimal route is via the National Highway network. Ensure you check AQI levels at major stopovers before starting.` };
    }
    if (text.includes("fever") || (text.includes("temperature") && text.includes("high"))) {
      return { type: 'text', text: "Dr. AirSense: If you have a fever, stay hydrated and rest. For mild fever, you can use a cool compress. Paracetamol is commonly used, but please consult a real doctor if it exceeds 102°F or persists for more than 3 days." };
    }
    if (text.includes("cough") || text.includes("cold") || text.includes("throat")) {
      return { type: 'text', text: `Dr. AirSense: For a cough or cold, try steam inhalation and warm ginger-honey tea. Avoid cold water. Since the air quality is ${risk.level}, wear a mask if you must go outside.` };
    }
    if (text.includes("headache")) {
      return { type: 'text', text: `Dr. AirSense: Headaches can often be triggered by pollution or dehydration. Drink plenty of water and rest. If the AQI is high (${aqi.pm25}), ensure your indoor air is purified.` };
    }
    if (text.includes("asthma") || text.includes("breathing")) {
      return { type: 'text', text: `Dr. AirSense: Keep your rescue inhaler handy. With a risk score of ${risk.score}, avoid outdoor exertion.` };
    }
    if (text.includes("weather") || text.includes("rain") || text.includes("sunny")) {
      const isCurrentLoc = text.includes(aqi.city.toLowerCase()) || !text.match(/in\s+([a-z]+)/i);
      if (isCurrentLoc) {
        return { type: 'text', text: `Current weather in ${aqi.city}: ${aqi.temp}°C, humidity ${aqi.humidity}%. Wind speed ${aqi.windSpeed} km/h.` };
      } else {
        const cityMatch = text.match(/in\s+([a-z]+)/i); const otherCity = cityMatch ? cityMatch[1] : "that city";
        return { type: 'text', text: `Weather in ${otherCity}: ~${Math.round(aqi.temp - 2)}°C with moderate cloud cover.` };
      }
    }
    // Replace map/route responses with health-focused guidance in chatbot mode
    if (text.includes("route") || text.includes("map") || text.includes("commute") || text.includes("office")) {
      return { type: 'text', text: `For your commute, minimize exposure: choose less‑trafficked streets, avoid peak hours, and wear a well‑fitting mask (N95/FFP2) when ${risk.level.toLowerCase()} risk is present. Best outdoor window today: ${activityWindow.windowLabel}.` };
    }
    if (text.includes("ventilation") || text.includes("window") || text.includes("air")) {
      return { type: 'text', text: `Dr. AirSense Advice: ${ventAdvice.status}. ${ventAdvice.description}` };
    }
    if (text.includes("run") || text.includes("jog") || text.includes("exercise")) {
      return { type: 'text', text: `Your personalized risk is ${risk.score} (${risk.level}). Best time: ${activityWindow.windowLabel} (PM2.5 ${activityWindow.pm25} µg/m³).` };
    }
    if (text.includes("hello") || text.includes("hi") || text.includes("hey")) {
      return { type: 'text', text: "Hello! I am Dr. AirSense. I can help with medical advice, weather updates, travel routes, or air quality analysis. How can I help?" };
    }
    // Lightweight knowledge base matching on the client for offline fallback
    const KB = [
      { keys: ['pm2.5', 'pm 2.5', 'fine particulate', 'fine particles'], text: 'PM2.5 are fine particles (≤2.5µm) that can reach deep lungs and bloodstream. Lower is better; use filtration and avoid outdoor exertion when elevated.' },
      { keys: ['aqi', 'air quality index'], text: 'AQI combines several pollutants into a single scale. AirSense+ focuses on your personalized exposure rather than city averages.' },
      { keys: ['mask', 'n95', 'ffp2', 'respirator'], text: 'Use a well‑fitting N95/FFP2 respirator. Ensure a good seal; avoid valves in crowded indoor spaces.' },
      { keys: ['indoor air', 'hepa', 'purifier', 'ventilation', 'exhaust', 'windows'], text: 'Improve indoor air: HEPA filtration, local exhaust, cross‑ventilation when outdoor air is cleaner, reduce indoor sources.' },
      { keys: ['reduce exposure', 'avoid pollution', 'protect', 'tips'], text: 'Choose less‑trafficked streets, avoid peak hours, close windows during spikes, use HEPA, wear N95/FFP2 outdoors when AQI is high.' },
      { keys: ['children', 'kid', 'pregnant', 'elderly', 'senior'], text: 'Sensitive groups are more affected. Avoid outdoor exertion on high AQI days, keep medications handy, maintain clean indoor air.' },
      { keys: ['humidifier', 'humidity', 'dry air'], text: 'Aim for 40–50% indoor humidity. Too high can grow mold; ventilate or dehumidify if needed.' }
    ];
    for (const entry of KB) {
      if (entry.keys.some(k => text.includes(k))) {
        return { type: 'text', text: entry.text
          .replace('{{riskScore}}', String(risk.score))
          .replace('{{riskLevel}}', String(risk.level))
          .replace('{{bestWindow}}', String(activityWindow.windowLabel))
          .replace('{{bestPm25}}', String(activityWindow.pm25))
        };
      }
    }
    return { type: 'text', text: `I’m focused on health and environment. For "${message}":
1) Clarify health/environment angle.
2) Check credible sources (WHO/CDC/local advisories).
3) Consider your personal risk (${risk.score} – ${risk.level}).
4) If urgent symptoms occur, seek medical care.
Try asking: "what is PM2.5", "best mask", "improve indoor air", or "best time to run".` };
  }
};

// -------------------------------
// FRONTEND COMPONENTS (from your code)
// -------------------------------
const SymptomTracker = ({ onFeedback, currentFactor }) => {
  const [selected, setSelected] = useState(null);
  const handleFeedback = (level) => {
    setSelected(level);
    let newFactor = 1.0; if (level === 1) newFactor = 1.25; if (level === 2) newFactor = 1.5;
    onFeedback(newFactor);
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-3 text-blue-800">
        <Stethoscope size={20} />
        <h2 className="text-lg font-bold">How do you feel today?</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">Your feedback adjusts your future risk thresholds.</p>
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => handleFeedback(0)} className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-2 ${selected === 0 ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'border-slate-200 hover:bg-slate-50'}`}>
          <ThumbsUp size={18} />
          Great
        </button>
        <button onClick={() => handleFeedback(1)} className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-2 ${selected === 1 ? 'bg-yellow-50 border-yellow-500 text-yellow-700 ring-1 ring-yellow-500' : 'border-slate-200 hover:bg-slate-50'}`}>
          <Info size={18} />
          Mild Cough
        </button>
        <button onClick={() => handleFeedback(2)} className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-2 ${selected === 2 ? 'bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500' : 'border-slate-200 hover:bg-slate-50'}`}>
          <ThumbsDown size={18} />
          Breathless
        </button>
      </div>
      {currentFactor > 1.0 && (
        <div className="mt-3 text-xs bg-orange-50 text-orange-700 p-2 rounded border border-orange-100 flex items-center gap-2">
          <AlertTriangle size={12} />
          Risk sensitivity increased due to symptoms.
        </div>
      )}
    </div>
  );
};

const AQIGrid = ({ aqi, ventilation }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-blue-800">
        <Wind size={20} />
        <h2 className="text-lg font-bold">Outdoor Air & Fusion</h2>
      </div>
      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{aqi.city}</span>
    </div>
    <div className={`mb-4 p-3 rounded-lg border text-sm flex items-start gap-3 ${ventilation.color}`}>
      <Wind className="mt-0.5 shrink-0" size={16} />
      <div>
        <div className="font-bold">{ventilation.status}</div>
        <div className="opacity-90 text-xs">{ventilation.description}</div>
        <div className="mt-1 text-[10px] opacity-75">Wind: {aqi.windSpeed} km/h • Temp: {aqi.temp}°C</div>
      </div>
    </div>
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-slate-50 p-2 rounded text-center"><div className="text-xs text-slate-500">PM2.5</div><div className="font-bold text-slate-800">{aqi.pm25}</div></div>
      <div className="bg-slate-50 p-2 rounded text-center"><div className="text-xs text-slate-500">PM10</div><div className="font-bold text-slate-800">{aqi.pm10}</div></div>
      <div className="bg-slate-50 p-2 rounded text-center"><div className="text-xs text-slate-500">NO₂</div><div className="font-bold text-slate-800">{aqi.no2}</div></div>
    </div>
    <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Why these numbers?</summary>
      <div className="mt-2 bg-slate-50 p-2 rounded border border-slate-100">
        Ventilation blends wind speed and pollution. Low wind with high PM2.5 can trap pollutants near the ground. High wind disperses them.
      </div>
    </details>
  </div>
);

const RiskCard = ({ risk, profile }) => {
  const getColor = (score) => { if (score < 30) return 'text-emerald-500 border-emerald-500'; if (score < 60) return 'text-yellow-500 border-yellow-500'; if (score < 80) return 'text-orange-500 border-orange-500'; return 'text-red-500 border-red-500'; };
  const getBgColor = (score) => { if (score < 30) return 'bg-emerald-50'; if (score < 60) return 'bg-yellow-50'; if (score < 80) return 'bg-orange-50'; return 'bg-red-50'; };
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4 text-blue-800 relative z-10">
        <div className="flex items-center gap-2"><AlertTriangle size={20} /><h2 className="text-lg font-bold">Personalized Risk Score</h2></div>
        <button onClick={() => setShowWhy((s) => !s)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"><Info size={14} />{showWhy ? 'Hide' : 'Explain'}</button>
      </div>
      <div className="flex flex-row items-center gap-6 relative z-10">
        <div className={`w-20 h-20 shrink-0 rounded-full border-4 flex items-center justify-center text-2xl font-bold bg-white ${getColor(risk.score)}`}>{risk.score}</div>
        <div className="flex-1">
          <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-2 uppercase tracking-wide ${getBgColor(risk.score)} ${getColor(risk.score).replace('border-', 'text-')}`}>{risk.level} Risk</div>
          <p className="text-sm text-slate-600 leading-relaxed">{risk.advice}</p>
          {risk.feedbackUsed && (<div className="mt-2 text-[10px] text-orange-600 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>Adjusted for recent symptoms</div>)}
        </div>
      </div>
      {showWhy && (
        <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-100 text-xs text-slate-600">
          Score blends PM2.5, your sensitivity ({profile?.sensitivity}), health conditions, and recent symptoms.
          It scales to 0–100 for simplicity.
        </div>
      )}
    </div>
  );
};

const ActivityForecast = ({ activityWindow }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
    <div className="flex items-center gap-2 mb-4 text-blue-800"><Activity size={20} /><h2 className="text-lg font-bold">Predictive Scheduling</h2></div>
    <div className="flex justify-between items-end h-16 mb-4 px-2 gap-2">
      {activityWindow.allSlots.map((slot, i) => {
        const isBest = slot.pm25 === activityWindow.pm25; const height = Math.max(20, (slot.pm25 / 150) * 100);
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 group relative">
            {isBest && (<div className="absolute -top-6 bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded">Best</div>)}
            <div className={`w-full rounded-t ${isBest ? 'bg-emerald-400' : 'bg-slate-200'}`} style={{ height: `${Math.min(100, height)}%` }}></div>
            <span className="text-[10px] text-slate-500 font-medium">{slot.hour}:00</span>
          </div>
        );
      })}
    </div>
    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 flex justify-between items-center">
      <div><div className="text-xs text-blue-800 uppercase font-bold tracking-wide">Recommended Window</div><div className="text-lg font-bold text-blue-900">{activityWindow.windowLabel}</div></div>
      <div className="text-right"><div className="text-xs text-blue-600">PM2.5 Forecast</div><div className="font-bold text-blue-800">{activityWindow.pm25} <span className="text-[10px] font-normal">µg/m³</span></div></div>
    </div>
  </div>
);

// Highlights card for Unique Value (USPs)
const USPHighlights = () => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
    <div className="flex items-center gap-2 mb-3 text-blue-800">
      <CheckCircle size={20} />
      <h2 className="text-lg font-bold">Why AirSense+ is different</h2>
    </div>
    <ul className="text-sm text-slate-700 space-y-2">
      <li className="flex items-start gap-2"><CheckCircle className="text-emerald-600 mt-0.5" size={16} /> Personalized exposure and health‑risk scoring, not a generic AQI.</li>
      <li className="flex items-start gap-2"><Activity className="text-blue-600 mt-0.5" size={16} /> Predictive scheduling for commute, exercise, and outdoor work.</li>
      <li className="flex items-start gap-2"><Navigation className="text-emerald-600 mt-0.5" size={16} /> Health‑aware route suggestions balancing time and pollution exposure.</li>
      <li className="flex items-start gap-2"><Wind className="text-slate-600 mt-0.5" size={16} /> Outdoor data fusion to give real ventilation and air‑quality advice.</li>
      <li className="flex items-start gap-2"><Stethoscope className="text-orange-600 mt-0.5" size={16} /> Smart thresholds that adapt using your feedback and symptoms.</li>
      <li className="flex items-start gap-2"><Info className="text-indigo-600 mt-0.5" size={16} /> Clear explanations behind forecasts and risk (weather shifts, fires, stagnation).</li>
    </ul>
  </div>
);

const RouteOptions = ({ routes, hidden }) => {
  if (hidden) return null; // hide routes in personal healthcare chatbot mode
  const [selectedId, setSelectedId] = React.useState(
    (routes && routes.find((r) => r.id === 'healthiest')?.id) || (routes && routes[0]?.id) || null
  );

  if (!Array.isArray(routes) || routes.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 col-span-1 md:col-span-2">
        <div className="flex items-center gap-2 mb-2 text-blue-800"><Navigation size={20} /><h2 className="text-lg font-bold">Health-Aware Routes</h2></div>
        <div className="text-sm text-slate-500">No route suggestions available.</div>
      </div>
    );
  }

  const selectedRoute = routes.find((r) => r.id === selectedId) || routes[0];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 col-span-1 md:col-span-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-blue-800"><Navigation size={20} /><h2 className="text-lg font-bold">Health-Aware Routes</h2></div>
        <div className="text-xs text-slate-500">Selected: <span className="font-bold" style={{ color: selectedRoute?.color }}>{selectedRoute?.label}</span></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="px-4 py-3 font-semibold text-slate-700">Type</th><th className="px-4 py-3 font-semibold text-slate-700">Duration</th><th className="px-4 py-3 font-semibold text-slate-700">Exposure</th><th className="px-4 py-3 font-semibold text-slate-700">Notes</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {routes.map((r) => {
              const active = r.id === selectedId;
              return (
                <tr key={r.id} className={`hover:bg-slate-50 transition-colors cursor-pointer ${active ? 'bg-slate-50' : ''}`} onClick={() => setSelectedId(r.id)}>
                  <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: r.color }}></div>{r.label}</td>
                  <td className="px-4 py-3 text-slate-600">{r.durationMinutes} min</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-bold ${r.id === 'healthiest' ? 'bg-emerald-100 text-emerald-700' : r.id === 'fastest' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>{r.exposureIndex}</span></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MockMap routes={routes} selectedId={selectedId} />
    </div>
  );
};

const MockMap = ({ routes, selectedId }) => (
  <div className="w-full h-48 bg-slate-100 rounded-lg relative overflow-hidden border border-slate-200 mt-2">
    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
    <svg className="w-full h-full" viewBox="0 0 300 150">
      <circle cx="30" cy="75" r="6" fill="#1e293b" />
      <text x="30" y="95" textAnchor="middle" fontSize="10" fill="#475569">Start</text>
      <circle cx="270" cy="75" r="6" fill="#1e293b" />
      <text x="270" y="95" textAnchor="middle" fontSize="10" fill="#475569">End</text>
      {/* Fastest (Red) */}
      <path d="M 30 75 Q 150 10 270 75" fill="none" stroke="#ef4444" strokeWidth={selectedId === 'fastest' ? 6 : 3} strokeDasharray="5,5" opacity={selectedId && selectedId !== 'fastest' ? 0.35 : 0.7} />
      {/* Balanced (Blue) */}
      <path d="M 30 75 L 270 75" fill="none" stroke="#3b82f6" strokeWidth={selectedId === 'balanced' ? 6 : 3} opacity={selectedId && selectedId !== 'balanced' ? 0.35 : 0.7} />
      {/* Healthiest (Green) */}
      <path d="M 30 75 Q 150 140 270 75" fill="none" stroke="#10b981" strokeWidth={selectedId === 'healthiest' ? 7 : 4} opacity={selectedId && selectedId !== 'healthiest' ? 0.35 : 1} />
    </svg>
    <div className="absolute top-2 right-2 bg-white/90 p-2 rounded text-[10px] shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Healthiest</div>
      <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div>Fastest</div>
    </div>
  </div>
);

const ChatAssistant = ({ onSend }) => {
  const [messages, setMessages] = useState([
    { from: "bot", type: "text", text: "Hello! I am Dr. AirSense, your personal healthcare chatbot. Ask about symptoms (fever, cough, asthma), exercise safety, masks, or today's best outdoor window." }
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; } }, [messages]);
  const handleSubmit = async (e) => {
    e.preventDefault(); if (!input.trim()) return;
    const userMessage = input.trim();
    setMessages((prev) => [...prev, { from: "user", type: "text", text: userMessage }]); setInput("");
    setTimeout(async () => { const reply = await onSend(userMessage); setMessages((prev) => [...prev, { from: "bot", ...reply }]); }, 600);
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[500px]">
  <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl flex items-center gap-2 text-blue-800"><MessageCircle size={20} /><h2 className="font-bold">Dr. AirSense – Healthcare Chatbot</h2></div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
        {messages.map((m, idx) => (
          <div key={idx} className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-line ${m.from === "user" ? "bg-blue-600 text-white ml-auto rounded-br-none" : "bg-white border border-slate-100 text-slate-800 mr-auto rounded-bl-none"}`}> 
            <p>{m.text}</p>
            {/* In healthcare chatbot mode, we avoid rendering maps */}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100">
        <div className="relative">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Dr. AirSense..." className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-full focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"><Send size={16} /></button>
        </div>
      </form>
    </div>
  );
};

const CONDITIONS = ["asthma", "copd", "allergy", "heart_disease"];
const ProfileForm = ({ onSave, existingProfile }) => {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [sensitivity, setSensitivity] = useState("medium");
  const [conditions, setConditions] = useState([]);
  useEffect(() => { if (existingProfile) { setName(existingProfile.name || ""); setCity(existingProfile.city || ""); setSensitivity(existingProfile.sensitivity || "medium"); setConditions(existingProfile.conditions || []); } }, [existingProfile]);
  const toggleCondition = (cond) => { setConditions((prev) => prev.includes(cond) ? prev.filter((c) => c !== cond) : [...prev, cond]); };
  const handleSubmit = (e) => { e.preventDefault(); onSave({ name, city, sensitivity, conditions }); };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4 text-blue-800"><User size={20} /><h2 className="text-lg font-bold">Health Profile</h2></div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-700 mb-1">Name</label><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Your name" /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">City</label><input type="text" required value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g., Kolkata" /></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-1">Sensitivity</label><select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"><option value="low">Low (no major issues)</option><option value="medium">Medium (occasional issues)</option><option value="high">High (frequent breathing issues)</option></select></div>
        <div><label className="block text-sm font-medium text-slate-700 mb-2">Conditions</label><div className="space-y-2">{CONDITIONS.map((c) => (<label key={c} className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-slate-50"><input type="checkbox" checked={conditions.includes(c)} onChange={() => toggleCondition(c)} className="rounded text-blue-600 focus:ring-blue-500" /><span className="text-sm text-slate-700 uppercase font-medium">{c.replace('_', ' ')}</span></label>))}</div></div>
        <button type="submit" className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white py-2.5 rounded-lg transition-colors font-medium mt-2"><Save size={18} />Save Profile</button>
      </form>
    </div>
  );
};

// -------------------------------
// LOGIN PAGE
// -------------------------------
const LoginPage = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); setError(''); };
  const handleSubmit = async (e) => {
    e.preventDefault(); const { name, email, password, confirmPassword } = formData;
    if (!email || !password) { setError('Please fill in all required fields'); return; }
    if (!isLogin && !name) { setError('Name is required for signup'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!isLogin && password !== confirmPassword) { setError('Passwords do not match'); return; }
  const users = getJSON('airsense_users', {});
    try {
      if (isLogin) {
        // Backend login
        const resp = await apiLogin({ email, password });
        const user = resp?.user || { name: 'User', email };
        if (resp?.token) setJSON('airsense_token', resp.token);
        setJSON('airsense_user', user);
        onLogin(user);
      } else {
        // Backend register
        const existing = users[email];
        if (existing) { setError('User already exists locally'); return; }
        const resp = await apiRegister({ name, email, password });
        const user = resp?.user || { name, email };
        if (resp?.token) setJSON('airsense_token', resp.token);
        setJSON('airsense_user', user);
        onLogin(user);
      }
    } catch (e) {
      // Fallback to local demo
      if (isLogin) {
        const user = users[email];
        if (user && user.password === password) { onLogin({ name: user.name, email: user.email }); }
        else if (email === 'demo@example.com' && password === 'password') { onLogin({ name: 'Demo User', email }); }
        else { setError('Invalid email or password'); }
      } else {
        if (users[email]) { setError('User already exists'); return; }
        users[email] = { name, email, password };
        setJSON('airsense_users', users);
        setSuccess('Account created locally. Please sign in.'); setIsLogin(true);
        setFormData({ name: '', email: '', password: '', confirmPassword: '' }); setTimeout(() => setSuccess(''), 3000);
      }
    }
  };
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden transition-all duration-300">
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-8 text-center relative overflow-hidden">
          <div className="relative z-10">
            <div className="mx-auto bg-white/10 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm border border-white/20"><MapIcon className="text-white" size={32} /></div>
            <h1 className="text-2xl font-bold text-white mb-2">AirSense+</h1>
            <p className="text-blue-100 text-sm opacity-90">{isLogin ? 'Welcome back to your health dashboard' : 'Create your personalized health profile'}</p>
          </div>
        </div>
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (<div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg border border-red-100 flex items-center gap-2 animate-pulse"><AlertTriangle size={14} />{error}</div>)}
            {success && (<div className="bg-emerald-50 text-emerald-600 text-xs p-3 rounded-lg border border-emerald-100 flex items-center gap-2"><CheckCircle size={14} />{success}</div>)}
            {!isLogin && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name</label>
                <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input name="name" type="text" value={formData.name} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 transition-all" placeholder="John Doe" /></div>
              </div>
            )}
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input name="email" type="email" value={formData.email} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 transition-all" placeholder="name@example.com" /></div></div>
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input name="password" type="password" value={formData.password} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 transition-all" placeholder="••••••••" /></div></div>
            {!isLogin && (<div className="space-y-1"><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Confirm Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 transition-all" placeholder="••••••••" /></div></div>)}
            <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg mt-4 active:scale-95">{isLogin ? 'Sign In' : 'Create Account'}</button>
            <div className="text-center mt-6"><p className="text-sm text-slate-500">{isLogin ? "Don't have an account? " : "Already have an account? "}<button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); }} className="text-blue-700 font-semibold hover:underline">{isLogin ? 'Sign Up' : 'Log In'}</button></p></div>
            <div className="text-center text-[10px] text-slate-400 mt-4 border-t border-slate-100 pt-4"><p>Demo Environment: Passwords are simulated locally.</p></div>
          </form>
        </div>
      </div>
    </div>
  );
};

// -------------------------------
// MAIN APP
// -------------------------------
export default function AirSenseApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState(null);
  // Restore session if token/user present
  useEffect(() => {
    const token = safeStorage.get('airsense_token', null);
    const user = getJSON('airsense_user', null);
    if (token) {
      setToken(token);
      if (user) {
        setIsAuthenticated(true);
        const defaultProfile = { name: user.name, city: "San Francisco", sensitivity: "medium", conditions: [] };
        setProfile(defaultProfile);
        setTimeout(() => { handleProfileSave(defaultProfile); }, 100);
      }
    }
  }, []);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cityOverride, setCityOverride] = useState("");
  const [symptomFactor, setSymptomFactor] = useState(1.0);
  const [chatbotMode, setChatbotMode] = useState(true);
  const [showDisclaimer, setShowDisclaimer] = useState(() => getJSON('airsense_disclaimer_dismissed', false) ? false : true);
  const [apiOnline, setApiOnline] = useState(null); // null unknown, true ok, false down

  const handleLogin = (user) => {
    setIsAuthenticated(true);
    const defaultProfile = { name: user.name, city: "San Francisco", sensitivity: "medium", conditions: [] };
    setProfile(defaultProfile);
    setTimeout(() => { handleProfileSave(defaultProfile); }, 100);
  };

  const handleProfileSave = async (data) => {
    const newProfile = { ...data };
    setProfile(newProfile);
    // Attempt to persist to backend (best effort)
    try {
      await apiSaveProfile(newProfile);
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
    await loadDashboard(newProfile, cityOverride);
  };

  const handleFeedbackChange = async (factor) => {
    setSymptomFactor(factor);
    if (profile) await loadDashboard(profile, cityOverride, factor);
  };

  const loadDashboard = async (prof, city, currentSymptomFactor = symptomFactor) => {
    if (!prof) return; setLoading(true);
    // Try backend first
    try {
      const data = await apiGetDashboard({ city: city || prof.city, symptomFactor: currentSymptomFactor });
      setDashboardData(data);
      setApiOnline(true);
    } catch (e) {
      // Fallback to local simulation
      const effectiveCity = city || prof.city;
      const aqi = RiskEngine.getMockAQI(effectiveCity);
      const forecast = RiskEngine.getMockForecast(aqi);
      const ventAdvice = RiskEngine.getVentilationAdvice(aqi);
      const risk = RiskEngine.computeRiskScore(aqi, prof, currentSymptomFactor);
      const activityWindow = RiskEngine.suggestActivityWindow(forecast);
      const routes = RiskEngine.getRouteOptions(aqi, prof);
      setDashboardData({ profile: prof, aqi, forecast, risk, activityWindow, routes, ventAdvice });
      setApiOnline(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => { if (profile) loadDashboard(profile, cityOverride); };
  const handleChatSend = async (message) => {
    if (!profile) return { type: 'text', text: "Please create a profile first so I can assess your risk." };
    // Backend first
    try {
      const { reply } = await apiSendChat({ message, city: cityOverride || profile.city, symptomFactor });
      setApiOnline(true);
      // If backend returns a map, still render as text only in this simplified UI
      return { type: 'text', text: reply?.text || '...' };
    } catch {
      setApiOnline(false);
      const effectiveCity = cityOverride || profile.city;
      const aqi = RiskEngine.getMockAQI(effectiveCity);
      const forecast = RiskEngine.getMockForecast(aqi);
      const ventAdvice = RiskEngine.getVentilationAdvice(aqi);
      const risk = RiskEngine.computeRiskScore(aqi, profile, symptomFactor);
      const activityWindow = RiskEngine.suggestActivityWindow(forecast);
      const routes = RiskEngine.getRouteOptions(aqi, profile);
      return RiskEngine.simpleChatReply(message, risk, activityWindow, routes, ventAdvice, aqi);
    }
  };

  if (!isAuthenticated) { return <LoginPage onLogin={handleLogin} />; }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {showDisclaimer && (
        <div className="w-full bg-yellow-50 text-yellow-800 text-xs px-4 py-2 border-b border-yellow-100 flex items-center justify-between">
          <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
            <span>Educational prototype. Not a substitute for professional medical advice.</span>
            <button className="text-yellow-700 underline" onClick={() => { setShowDisclaimer(false); setJSON('airsense_disclaimer_dismissed', true); }}>Dismiss</button>
          </div>
        </div>
      )}
      <header className="bg-gradient-to-r from-blue-900 to-blue-800 text-white pt-8 pb-12 px-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3"><MapIcon className="text-blue-300" /> AirSense+</h1>
            <p className="text-blue-200 max-w-md">Personalized environmental health risk assessment and routing engine.</p>
          </div>
          {profile && (
            <div className="hidden md:block text-right">
              <div className="text-sm text-blue-300 uppercase tracking-wider font-semibold">Welcome Back</div>
              <div className="font-bold text-xl">{profile.name}</div>
              <button onClick={() => { setIsAuthenticated(false); setProfile(null); safeStorage.remove('airsense_token'); safeStorage.remove('airsense_user'); }} className="text-xs text-blue-300 hover:text-white mt-1 underline">Sign Out</button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 -mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <ProfileForm onSave={handleProfileSave} existingProfile={profile} />
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Simulation Controls</h3>
              <div className="space-y-3">
                <input type="text" value={cityOverride} onChange={(e) => setCityOverride(e.target.value)} placeholder="Override City (e.g. Delhi)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <button onClick={handleRefresh} disabled={!profile || loading} className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  {loading ? "Analyzing..." : "Refresh Live Data"}
                </button>
                <label className="flex items-center justify-between text-sm bg-slate-50 border border-slate-200 rounded-lg p-2">
                  <span>Healthcare Chatbot mode</span>
                  <input type="checkbox" checked={chatbotMode} onChange={(e) => setChatbotMode(e.target.checked)} />
                </label>
                <div className="text-[11px] text-slate-500">
                  API: {apiOnline === null ? 'detecting…' : apiOnline ? `online (${getApiBase()})` : 'offline (using local simulation)'}
                </div>
              </div>
            </div>
            {dashboardData && (<SymptomTracker onFeedback={handleFeedbackChange} currentFactor={symptomFactor} />)}
          </div>
          <div className="lg:col-span-8 space-y-6">
            {/* Always show USPs at the top of the main pane */}
            <USPHighlights />
            {dashboardData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <RiskCard risk={dashboardData.risk} profile={dashboardData.profile} />
                  <AQIGrid aqi={dashboardData.aqi} ventilation={dashboardData.ventAdvice} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ActivityForecast activityWindow={dashboardData.activityWindow} />
                  <ChatAssistant onSend={handleChatSend} />
                </div>
                <RouteOptions routes={dashboardData.routes} hidden={chatbotMode} />
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><Activity size={32} /></div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Ready to Analyze</h3>
                <p className="text-slate-500 max-w-md mx-auto">Please complete your health profile on the left to generate your personalized air quality risk assessment and route suggestions.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
