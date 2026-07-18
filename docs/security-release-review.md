# Security and Operations Release Review

This review is for a first public URL shared with friends. It is not a full
commercial security audit, but it captures the risks that matter before putting
the current server on the internet.

## Current Mitigations

- The server is authoritative for room state, legal card validation, scoring, and session restore.
- Room state and session tokens can be stored in Redis with `REDIS_URL`.
- Per-room locks serialize room mutations in Redis or in the local process.
- Socket events validate payload shapes, required fields, string lengths, room IDs, and 4-digit room passwords.
- Socket events have rate limits. With Redis enabled, buckets survive reconnects and multiple server instances.
- Join attempts are additionally limited by room and client address with `COH_JOIN_ROOM_ATTEMPT_LIMIT`.
- Session restore attempts are additionally limited by room, player, and client address with `COH_RESUME_SESSION_ATTEMPT_LIMIT`.
- `/ready` verifies the room-state store and rate-limit store before the service is considered ready.
- `CORS_ORIGIN` can restrict browser clients to the deployed frontend origin.
- Room TTL removes abandoned rooms and their session tokens.
- Public URL E2E checks the deployed client, server health, server readiness, and the 4-player play flow.

## Must Before Sharing With Friends

- Deploy with Redis enabled. `/ready` should show `redis-rooms:` and `redis-rate-limit:`.
- Set `CORS_ORIGIN` to the exact client origin.
- Set `VITE_SERVER_URL` to the exact server origin and rebuild the client.
- Use a production Redis key prefix such as `coh-prod`.
- Confirm `COH_TRUST_PROXY_HEADERS=true` only when the server is behind a trusted proxy such as Render.
- Run:

```powershell
cd server
npm test
npm run build

cd ..\client
npm run build
npm run test:e2e

cd ..
.\scripts\compose-smoke.ps1
.\scripts\public-e2e.ps1 -ClientUrl https://your-client.example.com -ServerUrl https://your-server.example.com
```

## Known Acceptable Risks For Friend Sharing

- Room passwords are 4 digits for usability. Brute force is reduced by room/address rate limits, but this is not meant for private or sensitive games.
- Session tokens are stored in browser local storage. This is acceptable for casual play, but users should not share browser profiles on public machines.
- There are no user accounts, moderation tools, ban lists, or audit logs yet.
- Free hosting plans may sleep. The client should recover through reconnect/session restore, but the first request after sleep can be slow.

## Should Before Wider Public Release

- Add server-side metrics or structured logs for room creation, join failures, rate-limit hits, reconnects, and readiness failures.
- Add an admin-free way to report a broken room state, such as a visible room reset/recreate path.
- Consider longer optional room passcodes for public rooms while keeping 4-digit codes for private friend rooms.
- Add dependency vulnerability checks to CI.
- Add a production runbook with deploy, rollback, Redis data retention, and incident steps.
- Add browser matrix E2E for mobile Safari/Chrome if mobile play is expected.

## Operational Checks

- Keep `REDIS_URL` secret and avoid pasting it into issue trackers or screenshots.
- Do not delete Redis keys during a normal rollback because active rooms and session tokens live there.
- Verify the deployed server logs do not include session tokens or Redis connection strings.
- If many users report false rate-limit errors, raise `COH_JOIN_ROOM_ATTEMPT_LIMIT` or check whether proxy headers are configured incorrectly.
- If `/ready` fails while `/health` passes, treat the server as unavailable until Redis or rate-limit storage recovers.
