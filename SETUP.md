# dialer Setup Guide

## Quick Start

### 1. Start Backend (already running on port 4000)
```bash
cd backend
npm run dev
```

### 2. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Access the App
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## Authentication

The app uses JWT auth. Use these credentials to log in:
- **Email**: admin@example.com
- **Password**: password123

(Or sign up for a new account)

## Database

- SQLite database: `backend/data/cold-dialer.db`
- Currently seeded with:
  - 1 admin user
  - 2 campaigns
  - 1 call script
  - 40 leads
  - 5 call logs

## Sync to Twenty CRM

The sync service is configured and will:
- Create/update/delete `agencyLeads` in Twenty when leads change in OCD
- Create/update/delete `agencyCampaigns` in Twenty when campaigns change
- Update lead status in Twenty based on call outcomes

## Environment Variables

### Backend (.env.local)
```bash
TWENTY_BASE_URL=https://twenty.inferencesaver.com
TWENTY_API_KEY=<your-key>
SYNC_POLL_INTERVAL_MS=30000
PORT=4000
JWT_SECRET=<secret>

# Identity — Twenty OAuth (see docs/identity.md; the client is public PKCE-only)
TWENTY_OAUTH_CLIENT_ID=<registered-client-id>
TWENTY_OAUTH_CLIENT_SECRET=
TWENTY_OAUTH_REDIRECT_URI=http://localhost:5173/callback
TWENTY_OAUTH_SCOPE=api profile

# Only needed because this instance is behind an auth-guard nginx with basic auth:
TWENTY_BASIC_USER=
TWENTY_BASIC_PASSWORD=
```

### Frontend (.env.local)
```bash
VITE_API_URL=http://localhost:4000
```
