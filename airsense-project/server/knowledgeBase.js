// Simple, local health & environment knowledge base
// Each entry includes keywords and a templated answer.

const KB = [
  {
    id: 'what_is_pm25',
    keywords: ['pm2.5', 'pm 2.5', 'fine particulate', 'fine particles'],
    answer:
      'PM2.5 are fine particulate matter (≤2.5µm) that can travel deep into the lungs and even enter the bloodstream. High PM2.5 is linked to cough, asthma flare‑ups, and heart stress. Lower is better; use filtration and avoid outdoor exertion when levels are elevated.'
  },
  {
    id: 'what_is_aqi',
    keywords: ['aqi', 'air quality index'],
    answer:
      'AQI (Air Quality Index) combines multiple pollutants (PM2.5, PM10, NO₂, O₃, etc.) into a single scale. 0–50: Good, 51–100: Moderate, 101–200: Unhealthy‑for‑Sensitive, >200: Unhealthy/Very Unhealthy/Hazardous. AirSense+ focuses on personalized exposure, not just citywide averages.'
  },
  {
    id: 'masks',
    keywords: ['mask', 'n95', 'ffp2', 'respirator'],
    answer:
      'For pollution or respiratory protection, use a well‑fitting N95/FFP2 respirator. Check the seal, avoid valves in crowded indoor spaces, and replace filters/masks per manufacturer guidance.'
  },
  {
    id: 'indoor_air',
    keywords: ['indoor air', 'hepa', 'purifier', 'ventilation', 'exhaust', 'windows'],
    answer:
      'Improve indoor air by: (1) HEPA filtration for PM, (2) local exhaust (kitchen/bath) to remove fumes, (3) cross‑ventilation when outdoor air is cleaner, and (4) reducing indoor sources (smoke, incense, solvent use).'
  },
  {
    id: 'reduce_exposure',
    keywords: ['reduce exposure', 'avoid pollution', 'protect', 'tips'],
    answer:
      'To reduce exposure: choose less‑trafficked streets, avoid peak hours, keep windows closed during spikes, use HEPA filtration, and wear N95/FFP2 outdoors when AQI is high.'
  },
  {
    id: 'exercise_policy',
    keywords: ['exercise', 'run', 'jog', 'workout', 'gym'],
    answer:
      'Exercise guidance: Your risk is {{riskScore}} ({{riskLevel}}). Best outdoor window: {{bestWindow}} (PM2.5 ~{{bestPm25}}µg/m³). Prefer indoor training with filtration when risk is high.'
  },
  {
    id: 'children_care',
    keywords: ['child', 'children', 'kid', 'kids', 'pregnant', 'elderly', 'senior'],
    answer:
      'Sensitive groups (children, elderly, pregnant) are more affected by pollution. Keep medications handy, avoid outdoor exertion on high AQI days, and maintain clean indoor air.'
  },
  {
    id: 'pollen_allergy',
    keywords: ['pollen', 'allergy', 'hay fever'],
    answer:
      'For pollen allergies: keep windows closed during high pollen hours, use HEPA filtration, shower after outdoor exposure, and consider antihistamines per medical advice.'
  },
  {
    id: 'emergency_red_flags',
    keywords: ['emergency', 'red flags', 'danger', 'er'],
    answer:
      'Seek urgent care if you have severe breathlessness, chest pain, bluish lips, confusion, or very high fever persisting >3 days. AirSense+ is educational and not a substitute for medical care.'
  },
  {
    id: 'humidifiers',
    keywords: ['humidifier', 'humidity', 'dry air'],
    answer:
      'Moderate indoor humidity (40–50%) can help reduce irritation. Avoid excess humidity which can grow mold. Use dehumidification or ventilation if humidity is high.'
  }
];

module.exports = KB;
