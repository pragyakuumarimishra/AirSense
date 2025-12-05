// Simple API helper for AirSense+ client
// Uses axios with sane defaults and graceful fallbacks

import axios from 'axios';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) || 'http://localhost:4000';

let authToken = null;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  return config;
});

export function setToken(token) { authToken = token; }
export function clearToken() { authToken = null; }

export async function register({ name, email, password }) {
  const { data } = await api.post('/api/auth/register', { name, email, password });
  if (data?.token) setToken(data.token);
  return data;
}

export async function login({ email, password }) {
  const { data } = await api.post('/api/auth/login', { email, password });
  if (data?.token) setToken(data.token);
  return data;
}

export async function saveProfile(profile) {
  // Expects: { city, sensitivity, conditions }
  const { data } = await api.post('/api/profile', profile);
  return data.profile;
}

export async function getDashboard(params) {
  // Expects: { city?, symptomFactor? }
  const { city, symptomFactor } = params;
  const query = new URLSearchParams();
  if (city) query.set('city', city);
  if (typeof symptomFactor === 'number') query.set('symptomFactor', String(symptomFactor));
  const { data } = await api.get(`/api/dashboard?${query.toString()}`);
  return data; // { profile, aqi, forecast, risk, activityWindow, routes, ventAdvice }
}

export async function sendChat(body) {
  // Expects: { message, city?, symptomFactor? }
  const { data } = await api.post('/api/chat', body);
  return data; // { reply, context }
}

export function getApiBase() { return API_BASE; }
