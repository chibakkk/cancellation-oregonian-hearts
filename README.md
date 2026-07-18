# Cancellation Oregonian Hearts

[![CI](https://github.com/chibakkk/cancellation-oregonian-hearts/actions/workflows/ci.yml/badge.svg)](https://github.com/chibakkk/cancellation-oregonian-hearts/actions/workflows/ci.yml)

Cancellation Oregonian Hearts is a real-time trick-taking card game for 4 to 10 players.

The app is built as a browser client plus a central Socket.IO server. The server is the source of truth for rooms, turns, legal card validation, scoring, and session restore.

## Repository

- `client`: React / Vite frontend
- `server`: Node.js / Socket.IO game server

## Local Setup

Install dependencies in both workspaces.

```powershell
cd server
npm install

cd ..\client
npm install
```

Run the server and client in separate terminals.

```powershell
cd server
npm run start
```

```powershell
cd client
npm run dev
```

Open the client URL shown by Vite. By default the client connects to `http://localhost:3001`.

## Docker Compose

For a production-like local run with Redis:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

To run a one-command Compose smoke test:

```powershell
.\scripts\compose-smoke.ps1
```

The smoke test builds and starts `client`, `server`, and `redis`, verifies `GET /ready` is Redis-backed, checks the client health endpoint, then runs `docker compose down`. Add `-KeepRunning` if you want to inspect the app after the checks:

```powershell
.\scripts\compose-smoke.ps1 -KeepRunning
```

Default local URLs:

- Client: `http://localhost:8080`
- Server: `http://localhost:3001`
- Server readiness: `http://localhost:3001/ready`

The Compose setup runs three services: `client`, `server`, and `redis`. Redis stores room state, session tokens, room locks, and rate-limit buckets.

`docker-compose.local.yml` only contains local build overrides. In this environment it disables npm strict SSL inside Docker builds because the local Docker VM cannot validate the registry certificate chain. Keep production deployments on `docker-compose.yml` and remove the local override unless your deployment environment needs the same workaround.

Before using this outside your local machine, update these values in `docker-compose.yml` or your deployment environment:

- `CORS_ORIGIN`: deployed client origin, for example `https://coh.example.com`
- `VITE_SERVER_URL`: deployed server URL, for example `https://coh-server.example.com`

## Environment Variables

Use `.env.example` as the source of truth for deployment settings.

Client:

- `VITE_SERVER_URL`: URL of the Socket.IO server. Example: `https://coh-server.example.com`.

Server:

- `PORT`: HTTP/Socket.IO listen port. Default: `3001`.
- `CORS_ORIGIN`: allowed browser origin. Use the deployed client URL in production.
- `COH_TRUST_PROXY_HEADERS`: set to `true` only behind a trusted reverse proxy so pre-auth rate limits can use `X-Forwarded-For`.
- `REDIS_URL`: Redis connection URL. When set, Redis is used for room state and rate limiting.
- `COH_STATE_BACKEND`: set to `memory` only for throwaway local runs. Leave unset for JSON file persistence.
- `COH_STATE_DIR`: JSON room-state directory when Redis is not used.
- `COH_STATE_FILE`: legacy JSON state file path used for migration/fallback.
- `COH_ROOM_TTL_MS`: inactive room lifetime in milliseconds. Default: `86400000` (24 hours). Set `0` to disable expiration.
- `COH_ROOM_CLEANUP_INTERVAL_MS`: interval for deleting expired rooms while the server is running. Default: `3600000` (1 hour). Set `0` to disable the periodic scan.
- `COH_REDIS_KEY_PREFIX`: Redis key prefix for rooms and locks. Default: `coh`.
- `COH_REDIS_LOCK_TTL_MS`: Redis per-room lock timeout. Default: `10000`.
- `COH_JOIN_ROOM_ATTEMPT_LIMIT`: repeated join attempts allowed per room and client address. Default: `12`.
- `COH_JOIN_ROOM_ATTEMPT_WINDOW_MS`: join-attempt rate-limit window. Default: `60000`.
- `COH_RESUME_SESSION_ATTEMPT_LIMIT`: repeated session restore attempts allowed per room, player, and client address. Default: `30`.
- `COH_RESUME_SESSION_ATTEMPT_WINDOW_MS`: session-restore rate-limit window. Default: `60000`.

## Persistence

The server supports three persistence modes.

- Redis: set `REDIS_URL`. Recommended for public deployment.
- JSON files: leave `REDIS_URL` unset. Good for local development and simple single-server hosting.
- Memory: set `COH_STATE_BACKEND=memory`. State is lost on restart.

For public play with friends, prefer Redis so rooms and session tokens survive server restarts and redeploys. Redis is also used for Socket.IO event rate limiting when `REDIS_URL` is set; otherwise rate limiting falls back to in-memory buckets.

Rooms that have not been updated for `COH_ROOM_TTL_MS` are treated as expired. Expired rooms are skipped and deleted during server startup, deleted when accessed, and also cleaned by the periodic scan while the server is running. Session tokens are stored with their room, so they are removed with the expired room.

## Tests

Server tests:

```powershell
cd server
npm test
```

Client build:

```powershell
cd client
npm run build
```

E2E tests:

```powershell
cd client
npm run test:e2e
```

The E2E suite starts its own server and Vite client on test ports.

Compose E2E against already running Docker services:

```powershell
.\scripts\compose-smoke.ps1 -KeepRunning

cd client
npm run test:e2e:compose

cd ..
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

Use this when you want to verify the actual Docker client/server/Redis stack, not the Playwright-managed test servers.

Public URL E2E after deployment:

```powershell
.\scripts\public-e2e.ps1 `
  -ClientUrl https://your-client.example.com `
  -ServerUrl https://your-server.example.com
```

This checks the public client URL, verifies the deployed server `/ready` endpoint, then runs the same 4-player E2E flow against the public client. Use this after Render or another host has finished deploying both services.

## CI

GitHub Actions workflow is defined in `.github/workflows/ci.yml`.

The CI workflow runs on pushes to `main`, pull requests, and manual dispatch. It uses Node.js 20 and checks:

- Server dependency install with `npm ci`.
- Client dependency install with `npm ci`.
- Playwright Chromium browser install.
- Server tests: `cd server && npm test`.
- Server build: `cd server && npm run build`.
- Client build: `cd client && npm run build`.
- Playwright E2E: `cd client && npm run test:e2e`.

Docker Compose smoke tests and public URL E2E are kept as explicit pre-deploy checks because they need Docker or deployed URLs.

## Deployment Shape

Recommended first public setup:

- Frontend: Vercel, Netlify, or another static host
- Server: Render, Fly.io, Railway, or another Node.js host with WebSocket support
- State: Redis such as Upstash Redis or Railway Redis

This repository includes a Render Blueprint at `render.yaml` for a first Render-based deployment.

Build/deploy order:

1. Create Redis.
2. Deploy the server with `REDIS_URL` and `CORS_ORIGIN`.
3. Confirm the server `/ready` endpoint is Redis-backed.
4. Deploy the client with `VITE_SERVER_URL`.
5. Run the public play checks below.

### Production Environment Template

Client environment:

```env
VITE_SERVER_URL=https://your-server.example.com
```

Server environment:

```env
PORT=3001
CORS_ORIGIN=https://your-client.example.com
COH_TRUST_PROXY_HEADERS=true
REDIS_URL=rediss://default:password@your-redis-host:6379
COH_REDIS_KEY_PREFIX=coh-prod
COH_REDIS_LOCK_TTL_MS=10000
COH_ROOM_TTL_MS=86400000
COH_ROOM_CLEANUP_INTERVAL_MS=3600000
COH_JOIN_ROOM_ATTEMPT_LIMIT=12
COH_JOIN_ROOM_ATTEMPT_WINDOW_MS=60000
COH_RESUME_SESSION_ATTEMPT_LIMIT=30
COH_RESUME_SESSION_ATTEMPT_WINDOW_MS=60000
```

Notes:

- Use `rediss://` when the Redis provider requires TLS.
- `CORS_ORIGIN` must exactly match the deployed client origin, including `https://` and no trailing path.
- Set `COH_TRUST_PROXY_HEADERS=true` only when the server is behind a trusted managed proxy such as Render.
- `VITE_SERVER_URL` is baked into the client build, so rebuild/redeploy the client after changing it.
- Use a different `COH_REDIS_KEY_PREFIX` per environment, such as `coh-dev`, `coh-staging`, or `coh-prod`.
- Do not set `COH_STATE_BACKEND=memory` in public deployments.

### Render Blueprint

`render.yaml` defines three Render services:

- `cancellation-oregonian-hearts-server`: Docker web service for the Socket.IO server.
- `cancellation-oregonian-hearts-client`: static site for the Vite build.
- `cancellation-oregonian-hearts-redis`: Render Key Value instance for rooms, sessions, locks, and rate limits.

The Blueprint sets these public Render URLs by default:

- Server `CORS_ORIGIN`: `https://cancellation-oregonian-hearts-client.onrender.com`
- Client `VITE_SERVER_URL`: `https://cancellation-oregonian-hearts-server.onrender.com`

After the first deploy, confirm the actual Render URLs in the dashboard. If Render assigns a different hostname, update `CORS_ORIGIN` and `VITE_SERVER_URL` in `render.yaml` or the Render dashboard, then redeploy the affected service. The client must be rebuilt after changing `VITE_SERVER_URL`.

The Blueprint uses Render Key Value with `ipAllowList: []`, so the Redis-compatible service is internal-only. The server receives its Redis connection string through `REDIS_URL`.

For the free Render Key Value plan, `persistenceMode` is `off`. This is enough for public smoke testing with friends, but room state and session tokens can be lost when Render restarts the Key Value instance. Upgrade the Key Value instance before relying on server-restart recovery in production.

The server exposes two health endpoints:

- `GET /health`: lightweight process liveness check. Returns `{ "ok": true }`.
- `GET /ready`: dependency readiness check. Verifies the state store and rate-limit store, then returns their descriptions. Use this for deployment readiness checks when Redis is enabled.

Expected production `/ready` response shape:

```json
{
  "ok": true,
  "stateStore": "redis-rooms:coh-prod:room:*",
  "rateLimitStore": "redis-rate-limit:coh-prod:rate:*"
}
```

## Pre-Deploy Checklist

Before deploying:

- Server tests pass: `cd server && npm test`.
- Server build passes: `cd server && npm run build`.
- Client build passes: `cd client && npm run build`.
- E2E suite passes: `cd client && npm run test:e2e`.
- GitHub Actions CI is green for the target branch.
- Compose smoke test passes locally: `.\scripts\compose-smoke.ps1`.
- Compose E2E passes locally against the Docker stack: `cd client && npm run test:e2e:compose`.
- Public URL E2E command is ready for the target URLs: `.\scripts\public-e2e.ps1 -ClientUrl ... -ServerUrl ...`.
- Redis has been created and its connection URL is available.
- Deployment platform supports WebSocket connections.
- Client and server URLs are decided before setting `VITE_SERVER_URL` and `CORS_ORIGIN`.
- `COH_REDIS_KEY_PREFIX` is unique for the target environment.
- Room TTL is acceptable for play sessions. Default is 24 hours.
- Read the security and operations review in `docs/security-release-review.md`.

## Public Release Checklist

Before sharing a URL with friends:

- Deployed server `/ready` returns Redis-backed `stateStore` and `rateLimitStore`.
- Deployed client loads without console connection errors.
- Create a room from the deployed client.
- Join the room from another browser, private window, or device.
- Start a 4-player test room.
- Play several tricks and confirm turns update for every player.
- Reload one player during play and confirm session restore works.
- Close one tab, open the room again, and confirm session restore works.
- Complete at least one round and confirm round 2 starts.
- Stop/restart the server once, then confirm an existing session can resume.
- Confirm an expired/abandoned room is removed after the configured TTL.
- Confirm wrong room password and duplicate name errors display as readable Japanese text.
- Run `.\scripts\public-e2e.ps1 -ClientUrl ... -ServerUrl ...` against the deployed URLs.

## Rollback Notes

If a deployment has trouble:

- Keep the old client deployment available until the new server `/ready` passes.
- Roll back the client first if `VITE_SERVER_URL` is wrong.
- Roll back the server if `/ready` fails or Redis-backed restore does not work.
- Preserve Redis data unless the issue is bad state data. Deleting Redis keys removes active rooms and session tokens.
