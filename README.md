# Apples to Apples MVP

Minimal multiplayer prompt + noun card game built with Next.js App Router.

## Setup

Create `.env.local` with Upstash Redis credentials:

```
UPSTASH_REDIS_REST_URL=https://YOUR_ENDPOINT
UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN
```

Install dependencies and run:

```
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- Room state is stored in Upstash Redis with 24h TTL.
- Clients poll `/api/room/state` every second.
- Hands are only returned to the owner via `/api/hand` with a player token.
