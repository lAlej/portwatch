# Portwatch

A small dashboard for managing the Docker containers on one host from a
browser. Built as a self-hosted alternative to Portainer, focused on doing a
few things well instead of everything.

**Live stats** — CPU, memory, disk, and network throughput in real time, both
host-wide and per-container. **Container controls** — start, pause, unpause,
restart, kill. **Live logs** — stdout/stderr in a real terminal viewer
(xterm.js) with INFO/WARN/ERROR/DEBUG level colouring.

Single admin user, JWT in an httpOnly cookie, single-binary deploy with
`docker compose`.

---

## Screenshots

| Dashboard | Container detail |
| --- | --- |
| ![Dashboard](docs/dashboard.png) | ![Container detail](docs/container.png) |
| Bento grid: host stats + container table | Stats strip + tabbed stats/logs/inspect |

---

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Node 20, Express, Socket.IO, TypeScript, **hexagonal architecture** (domain / adapters / driving / composition) |
| Docker bridge | `dockerode`, `systeminformation` |
| Frontend | Vite, React 19, TypeScript, Tailwind, Zustand, Zod, Recharts, xterm.js |
| Reverse proxy | Caddy (auto-TLS via Let's Encrypt) |
| Deploy | Docker Compose, single host |

No database. No event bus. No DI library. One admin, one process, one host.

---

## Repo layout

```
.
├── backend/                 # Express + Socket.IO + Dockerode
│   ├── src/
│   │   ├── domain/          # pure entities, ports, use cases (no IO imports)
│   │   ├── adapters/        # DockerContainerRepository, BcryptPasswordHasher, ...
│   │   ├── driving/         # http/server.ts + ws/socketServer.ts (thin)
│   │   └── composition/     # container.ts — the only file that knows every layer
│   └── Dockerfile
├── frontend/                # Vite + React + Tailwind
│   ├── src/
│   │   ├── app/             # App.tsx, Layout.tsx (N5 floating-pill nav)
│   │   ├── features/        # auth, stats, containers, logs (feature-based)
│   │   └── shared/          # ui primitives (Button, Card, Badge, Spinner)
├── docker-compose.yml       # backend + frontend + caddy
├── Caddyfile                # TLS + reverse proxy
└── .env.example             # ADMIN_PASSWORD_HASH, JWT_SECRET, COOKIE_SECURE, PORT
```

### Hexagonal backend

Strict separation between business rules and IO:

- **`domain/`** — entities, port interfaces (`ContainerRepository`,
  `StatsProvider`, `LogStreamer`, `PasswordHasher`, `TokenService`,
  `AuthService`, `Logger`), use cases. **Zero** imports from `dockerode`,
  `express`, or `socket.io`. The whole thing is unit-testable with no Docker
  daemon running.
- **`adapters/`** — concrete implementations of every port. Swap `DockerContainerRepository`
  for a fake in tests without touching a use case.
- **`driving/`** — HTTP and WS handlers. Each one: validate → use case → respond.
  ~50 lines each. No business logic.
- **`composition/container.ts`** — the composition root. The only file that
  imports every layer. Reads env, wires concrete adapters to use cases,
  hands them to driving. Change `EnvAuthService` to `LdapAuthService` in one
  place.

Why: every adapter is replaceable. Every use case is pure. Every handler is
thin. The repo is small but the seams are real.

---

## First-time setup

### 1. Clone and copy env

```bash
cp .env.example .env
```

Fill in the placeholders (see [Configuration](#configuration) below).

### 2. Generate a password hash

```bash
cd backend
pnpm install
pnpm hash-password 'your-strong-password'
```

Copy the printed bcrypt hash into `ADMIN_PASSWORD_HASH` in `.env`.

### 3. Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Paste into `JWT_SECRET` in `.env`.

### 4. Edit `Caddyfile`

Replace `:8080` with your domain (e.g. `portwatch.example.com { ... }`) and
add a `tls { email you@example.com }` block so Caddy can request a Let's Encrypt cert automatically.

---

## Development

Two terminals — backend on `:4000`, frontend on `:5173` with Vite proxying
`/api` and `/socket.io` to the backend.

```bash
# terminal 1
cd backend
pnpm install
pnpm dev          # tsx watch on :4000

# terminal 2
cd frontend
pnpm install
pnpm dev          # vite on :5173
```

Open <http://localhost:5173>. Sign in with the username/password you hashed.

---

## Production (on the VPS)

```bash
docker compose up -d --build
```

By default the dashboard is served on **`http://<vps-ip>:8080`** (non-privileged port — fewer scanners, no conflict with system services). Open it on the VPS firewall:

```bash
sudo ufw allow 8080/tcp
sudo ufw reload
```

Don't forget the cloud provider's edge firewall / security group — OS-level ufw alone isn't enough on DO, Hetzner, Vultr, AWS Lightsail, etc. Add an inbound TCP 8080 rule in the provider's console.

Caddy terminates TLS on `:8080` and proxies:

| Path | Upstream |
| --- | --- |
| `/api/*` | `backend:4000` |
| `/socket.io/*` | `backend:4000` (WebSocket upgrade preserved) |
| `/*` | `frontend:80` (nginx serving the static Vite build) |

Health check:

```bash
curl https://yourdomain.example.com/api/health
# → {"ok":true}
```

---

## Configuration

`.env` (loaded by the backend container via `env_file`):

| Variable | Description |
| --- | --- |
| `ADMIN_USERNAME` | Login username. Single admin. |
| `ADMIN_PASSWORD_HASH` | bcrypt hash. Generate with `pnpm hash-password`. |
| `JWT_SECRET` | 32+ random bytes, base64 or hex. Rotating it logs everyone out. |
| `COOKIE_SECURE` | `true` in production (HTTPS-only cookie). `false` only for local HTTP dev. |
| `PORT` | Backend listen port. Defaults to `4000`. Compose expects `4000`. |

Frontend build arg (set in `docker-compose.yml`):

| Arg | Description |
| --- | --- |
| `VITE_API_BASE` | Empty string `""` when reverse-proxying same-origin. Set to e.g. `https://api.example.com` if you split frontend and backend across subdomains. |

---

## Architecture notes

- **One source of truth for state on the server.** Container list and host
  stats are pushed via Socket.IO. The client doesn't poll. WebSocket
  reconnection is handled by `socket.io-client`.
- **Optimistic control actions.** Start/pause/restart/kill execute and the
  next state push reflects the new state. No confirmation modal — every
  action is reversible (`docker run` again brings it back).
- **Zod schemas at every boundary.** HTTP bodies, WS payloads, the
  dockerode shape — all validated with Zod on the way in. The shared
  schemas in `frontend/src/shared/lib/schemas.ts` mirror the backend's.
- **System stats come from `systeminformation`, not from `/proc` directly.**
  Linux + macOS + Windows parity; no shell-out; one less attack surface.
- **Docker socket mounted read-only.** Start/pause/restart/kill are runtime
  ops against an existing container, not image / volume / network ops.
  You cannot `docker pull` or build through this app. Pull on the host.

---

## Verification

Both projects typecheck and build cleanly:

```bash
cd backend && pnpm typecheck && pnpm build
cd frontend && pnpm typecheck && pnpm build
```

The frontend ships a production bundle to `frontend/dist/` (~4.8 KB gz CSS,
~236 KB gz JS). Backend emits to `backend/dist/`.

Smoke test the running backend:

```bash
curl -s http://localhost:4000/api/health | jq
# { → "ok": true, → "uptime": 12345, ... }
```

---

---

## Security

- **JWT in httpOnly, SameSite=Strict cookie.** JavaScript on the page
  cannot read it. CSRF is mitigated at the cookie level.
- **bcrypt password hashing.** No plaintext anywhere on disk or in env.
- **Docker socket is mounted read-only.** The app can manage containers
  already on the host, but cannot modify the Docker daemon's configuration,
  pull images, or build new ones.
- **`COOKIE_SECURE=true` in production.** Browser refuses to send the
  cookie over plain HTTP.
- **Single admin.** No user management surface. No privilege escalation
  paths. If you need multi-user, fork or extend — don't try to bolt it on.

Threat model: assumes a single trusted operator running the app on a VPS
they control. Does **not** defend against a compromised browser session,
Docker daemon compromise, or the operator themselves.

---

## License

MIT. See [`LICENSE`](LICENSE).
