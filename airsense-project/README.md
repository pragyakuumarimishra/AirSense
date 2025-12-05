# AirSense+

A minimal full-stack demo: Node.js + Express backend with mocked AQI, and a React (Vite) frontend featuring an enhanced Dr. AirSense assistant, risk scoring, ventilation insight, activity forecast, and health-aware routes.

## Unique Value (USPs)
- Personalized exposure and health‑risk scoring instead of generic AQI
- Predictive scheduling that suggests the best time for commute, exercise, or outdoor work
- Health‑aware route suggestions balancing travel time with pollution exposure
- Outdoor data fusion (wind, temp, PM) for real ventilation and air‑quality advice
- Smart thresholds that adapt based on user feedback and symptoms
- Clear explanations for forecasts and risk (weather shifts, fires, stagnation)

## Prerequisites
- Node.js 18+
- Windows PowerShell (commands below)

## Setup & Run

### 1) Backend
```
# In PowerShell
cd c:\Users\ishan\Desktop\FINALYEARPROJ\airsense-project\server
npm install
npm run start
```
You should see: `AirSense+ backend running on http://localhost:4000`

### 2) Frontend
Open a new terminal window:
```
# In PowerShell
cd c:\Users\ishan\Desktop\FINALYEARPROJ\airsense-project\client
npm install
npm run dev
```
Open the URL shown (usually http://localhost:5173).

## Flow
1. Sign up or use demo credentials: `demo@example.com` / `password`
2. Save your profile (name, city, sensitivity, conditions)
3. Optionally override city and refresh data
4. See AQI, risk, ventilation, activity window, and routes
5. Chat with Dr. AirSense (try "Kolkata to Delhi", "I have a cough", "weather in Mumbai", "best time to run")

## Notes
- Tailwind-like classes are used for styling; a minimal CSS fallback is included so the UI renders without full Tailwind setup. You can add real Tailwind later.
- The backend uses mocked data; replace with real AQI/weather APIs when ready.
 - Frontend now calls the backend for dashboard and chat (with automatic local fallback if the API is offline). The API status shows in the Simulation Controls card.
 - You can toggle Healthcare Chatbot mode to hide/show routes and map preview. When enabled (default), the focus is on personal health guidance.
 - A small banner reminds that this is not medical advice; you can dismiss it.

## Authentication & Persistence
- The backend now supports JWT auth and MongoDB persistence.
- Create a `.env` file under `server/` with:

```
# server/.env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-long-random-string
PORT=4000
USE_LIVE=1
```

- After registering or logging in, the frontend stores the token and uses it for protected endpoints (`/api/profile`, `/api/dashboard`, `/api/chat`).
- If the API or DB is offline, the app falls back to local simulation so your demo remains usable.

## Frontend API base
- Override the API base via `client/.env`:

```
# client/.env
VITE_API_BASE=http://localhost:4000
```

## Live data (optional)
- Set `USE_LIVE=1` in `server/.env` to enable real weather (Open‑Meteo) and AQI (OpenAQ) fetching with graceful fallback.
- If live sources are unavailable, the app uses local mock data so the demo remains stable.

## Docker (optional)
### Server
Build and run the API:

```
cd c:\Users\ishan\Desktop\FINALYEARPROJ\airsense-project\server
docker build -t airsense-server .
docker run -p 4000:4000 --env-file .env airsense-server
```

### Client
Build and serve the frontend:

```
cd c:\Users\ishan\Desktop\FINALYEARPROJ\airsense-project\client
docker build -t airsense-client .
docker run -p 8080:80 airsense-client
```



## Configuration
- API base URL can be overridden via Vite env: set `VITE_API_BASE` in a `.env` file under `client/` (default is `http://localhost:4000`).

