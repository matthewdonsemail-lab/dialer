# Deployment Guide

## Docker Deployment (Recommended)

### Production

```bash
# Clone and configure
git clone https://github.com/matthewdonsemail-lab/dialer.git
cd dialer
cp .env.example .env.local

# Configure environment
echo "TWENTY_BASE_URL=https://your-twenty-instance.com" >> .env.local
echo "TWENTY_API_KEY=your-api-key" >> .env.local
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env.local

# Optional: SIP configuration for softphone
echo "VITE_SIP_URI=sip:your-extension@your-domain.sip.signalwire.com" >> frontend/.env.local
echo "VITE_SIP_PASSWORD=your-password" >> frontend/.env.local
echo "VITE_SIP_WS_URL=wss://your-domain.sip.signalwire.com" >> frontend/.env.local
echo "VITE_SIP_CALLER_ID=+1XXXXXXXXXX" >> frontend/.env.local

# Build and start
docker compose up -d

# Access at http://localhost:3000
```

### Development

```bash
docker compose -f docker-compose.dev.yml up
```

## VPS Deployment

### Prerequisites
- Ubuntu 22.04+ or similar
- Docker and Docker Compose
- Domain name (optional)

### Steps

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Clone project
git clone https://github.com/matthewdonsemail-lab/dialer.git
cd dialer

# Configure
cp .env.example .env.local
nano .env.local  # Add your Twenty credentials

# Start
docker compose up -d
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api {
        proxy_pass http://localhost:4000;
    }
}
```

## Hostinger Deployment

See [HOSTINGER_SETUP.md](../scripts/HOSTINGER_SETUP.md)

## Environment Variables

### Frontend (.env.local)
| Variable | Required | Description |
|----------|----------|-------------|
| VITE_API_URL | No | Backend API URL |
| VITE_SIP_URI | No | SIP registration URI |
| VITE_SIP_PASSWORD | No | SIP password |
| VITE_SIP_WS_URL | No | WebSocket URL for SIP |
| VITE_SIP_CALLER_ID | No | Outbound caller ID |

### Backend (.env.local)
| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | Server port (default: 4000) |
| JWT_SECRET | Yes | Secret for JWT tokens |
| TWENTY_BASE_URL | Yes | Your Twenty instance URL |
| TWENTY_API_KEY | Yes | Twenty API key |
| TWENTY_DATABASE_URL | Yes | PostgreSQL connection string |

## SIP Configuration

To make real calls, configure your SIP provider in `frontend/.env.local`:

```env
VITE_SIP_URI=sip:your-extension@your-domain.sip.signalwire.com
VITE_SIP_PASSWORD=your-password
VITE_SIP_WS_URL=wss://your-domain.sip.signalwire.com
VITE_SIP_CALLER_ID=+1XXXXXXXXXX
```

See [SIP Providers Guide](sip-providers.md) for provider-specific setup.
