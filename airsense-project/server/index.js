// index.js
const express = require("express");
const cors = require("cors");
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { connect, User, Profile } = require('./db');
const {
  getMockAQI,
  getMockForecast,
  getVentilationAdvice,
  computeRiskScore,
  suggestActivityWindow,
  getRouteOptions,
  simpleChatReply
} = require("./riskEngine");
const { getLiveAQI, getLiveForecast } = require('./dataSources');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());

// Connect DB
connect(process.env.MONGODB_URI || '').catch(err => {
  console.error('MongoDB connection failed:', err.message);
});

// In-memory fallback remains for demo
const users = {};

// Auth helpers
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get("/", (req, res) => {
  res.json({ status: "AirSense+ API running" });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, name, passwordHash });
    const token = jwt.sign({ userId: user._id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email, name } });
  } catch (e) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post("/api/profile", authMiddleware, async (req, res) => {
  const { city, sensitivity, conditions } = req.body || {};
  try {
    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.userId },
      { city: city || 'Unknown', sensitivity: sensitivity || 'medium', conditions: Array.isArray(conditions) ? conditions : [] },
      { upsert: true, new: true }
    );
    res.json({ success: true, profile });
  } catch (e) {
    res.status(500).json({ error: 'Profile save failed' });
  }
});

app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.userId });
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: 'Profile load failed' });
  }
});

app.get("/api/dashboard", authMiddleware, async (req, res) => {
  const { city, symptomFactor } = req.query;
  const profile = await Profile.findOne({ userId: req.user.userId });
  if (!profile) return res.status(404).json({ error: "Profile not found" });

  const effectiveCity = city || profile.city;
  const useLive = (process.env.USE_LIVE === '1' || process.env.USE_LIVE === 'true');
  const aqi = useLive ? await getLiveAQI(effectiveCity) : getMockAQI(effectiveCity);
  const forecast = useLive ? await getLiveForecast(aqi) : getMockForecast(aqi);
  const ventAdvice = getVentilationAdvice(aqi);
  const risk = computeRiskScore(aqi, profile, Number(symptomFactor) || 1.0);
  const activityWindow = suggestActivityWindow(forecast);
  const routes = getRouteOptions(aqi, profile);

  res.json({ profile, aqi, forecast, risk, activityWindow, routes, ventAdvice });
});

app.post("/api/chat", authMiddleware, async (req, res) => {
  const { message, city, symptomFactor } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
  const profile = await Profile.findOne({ userId: req.user.userId }) || {
    userId: req.user.userId,
    name: "User",
    city: city || "Unknown",
    sensitivity: "medium",
    conditions: []
  };
  const effectiveCity = city || profile.city;
  const useLive = (process.env.USE_LIVE === '1' || process.env.USE_LIVE === 'true');
  const aqi = useLive ? await getLiveAQI(effectiveCity) : getMockAQI(effectiveCity);
  const forecast = useLive ? await getLiveForecast(aqi) : getMockForecast(aqi);
  const ventAdvice = getVentilationAdvice(aqi);
  const risk = computeRiskScore(aqi, profile, Number(symptomFactor) || 1.0);
  const activityWindow = suggestActivityWindow(forecast);
  const routes = getRouteOptions(aqi, profile);

  const reply = simpleChatReply(message, risk, activityWindow, routes, ventAdvice, aqi);
  res.json({ reply, context: { risk, activityWindow, aqi, ventAdvice } });
});

app.listen(PORT, () => {
  console.log(`AirSense+ backend running on http://localhost:${PORT}`);
});
