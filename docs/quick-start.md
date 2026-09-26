# Quick Start

Get Cold Dialer running in 5 minutes.

## Prerequisites

- Node.js 20 or higher
- npm

## Self-Hosted Backend

```bash
# Clone the repository
git clone https://github.com/matthewdonsemail-lab/dialer.git
cd dialer

# Setup backend
cd backend
npm install
npm run dev

# In a new terminal, setup frontend
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local and set VITE_API_URL=http://localhost:4000
npm run dev
```

Open http://localhost:3000

## Docker

```bash
git clone https://github.com/matthewdonsemail-lab/dialer.git
cd dialer

# Copy environment file
cp .env.example .env.local
# Edit .env.local with your Twenty credentials

# Start services
docker compose up

# In a new terminal, seed the database
docker compose exec backend npm run seed
```

Open http://localhost:3000
