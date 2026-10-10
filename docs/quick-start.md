# Quick Start

Get the dialer running against your own Twenty workspace in five minutes.

## Prerequisites

- [Bun](https://bun.sh) and Node.js 20 or later
- A [Twenty](https://twenty.com) workspace (cloud or self-hosted) and an API key
  (Settings, APIs and Webhooks)
- A [Telnyx](https://telnyx.com) SIP credential for calls (see
  [sip-providers.md](sip-providers.md) for others)

## Steps

```bash
git clone https://github.com/matthewdonsemail-lab/dialer.git
cd dialer
./scripts/setup.sh            # installs, creates .env.local, checks the schema
```

Fill in `TWENTY_BASE_URL`, `TWENTY_API_KEY` and `JWT_SECRET` in `.env.local`
and the `VITE_SIP_*` values in `frontend/.env.local`, then:

```bash
./scripts/setup.sh --apply    # creates every object and field in Twenty
./scripts/setup.sh --seed     # optional: the demo workspace (fresh workspaces only)
bun run dev
```

Open http://localhost:5173 (the dev server is pinned to 5173: the Twenty OAuth
callback lives at `http://localhost:5173/callback`, see
[identity.md](identity.md)) and sign in with your Twenty account.

## Docker

```bash
cp .env.example .env.local    # then fill it in
docker compose -f docker/docker-compose.yml up
```

The schema still comes from `bun run twenty:schema`; the containers do not
create it.
