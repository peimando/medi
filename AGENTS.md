# MediQueue — Agent Guide

## Stack & entrypoint
- **Backend:** Node.js + Express + Socket.io, monolith in `server.js` (single entrypoint)
- **Frontend:** React SPA in `frontend/` — Vite + Tailwind CSS, served via `npm run dev` (port 5173, proxies `/api/*` → backend)
- **DB:** PostgreSQL 15+, Redis optional (gracefully degrades)
- **No linter, no formatter, no TypeScript** — none configured

## Essential commands
| Command | What it runs |
|---|---|
| `npm start` | `node server.js` |
| `npm run dev` | `nodemon server.js` |
| `npm run migrate` | `node migrations/run.js` |
| `npm run seed` | `node scripts/seed.js` |
| `npm run dev` (en `frontend/`) | `vite` — frontend dev server en :5173, proxy API → :3000 |
| `npm test` | unit tests only (60 tests, 4 suites) |
| `npm run test:integration` | integration tests — needs `db_test` on **:5433** |
| `npm run test:all` | all tests in-band |

## Testing quirks
- Integration tests require `docker-compose --profile test up -d` first (spins up `db_test` on port 5433, ephemeral `tmpfs`).
- Tests use `TEST_DATABASE_URL` env var, defaulting to `postgresql://mediqueue_user:mediqueue_pass@localhost:5433/mediqueue_test`.
- `beforeEach` truncates `patients` and `ticket_sequences` tables.
- Concurrency tests (`SKIP LOCKED`, 50 parallel inserts) have 15–20s timeouts.

## Architecture
- **Config loaded from DB** at startup (`src/config/loader.js` singleton). `POST /api/config/reload` hot-reloads.
- **Queue concurrency:** `SELECT ... FOR UPDATE SKIP LOCKED` — guarantees two simultaneous "call next" never get the same patient.
- **Ticket sequence:** atomic `INSERT ... ON CONFLICT DO UPDATE` via `ticket_sequences` table (per-service, per-day).
- **WebSocket rooms:** `service:{id}`, `manager_dashboard`, `display_board`, `patient:{id}`.
- **Display board** pushes every 2s; analytics dashboard every 5s (configurable in `system_config` DB table).
- **Migrations auto-run** in Docker (`command: sh -c "node migrations/run.js && node server.js"`).
- **Logging:** winston (JSON in production, pretty-print in dev) + morgan HTTP access log.
- **Security:** helmet CSP, rate-limit global (300/15min) + per-IP compliance limiter (10/15min), `.dockerignore` prevents secrets in build context.
- **Admin UI:** Sidebar-based configuration panel at `/api/admin` (frontend route). Only accessible to users with `all` permission. Sections: Establishments, Services, Boxes, Roles, Users, System Config.

## Frontend structure
```
frontend/src/
├── components/          # ErrorBoundary, Spinner, Btn, ToastContainer, ConfirmDialog
├── hooks/               # useApi (apiFetch), useAuth, useConfig, useUtils
├── views/               # AdminView, AdminLayout (admin sections)
├── App.jsx              # Root — routing via view state, all 7 main views inline
└── main.jsx             # Entrypoint
```

## Admin API endpoints (backend routes/config.js)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Full tree (est → floor → service → boxes) |
| GET | `/api/config/services` | Flat list of active services |
| GET | `/api/config/all-boxes` | All boxes with service/staff info |
| GET | `/api/config/boxes/:id` | Boxes for a service |
| POST | `/api/config/establishments` | Create establishment |
| PUT | `/api/config/establishments/:id` | Update establishment |
| POST | `/api/config/floors` | Create floor |
| PUT | `/api/config/floors/:id` | Update floor |
| POST | `/api/config/services` | Create service |
| PUT | `/api/config/services/:id` | Update service |
| POST | `/api/config/boxes` | Create box |
| PUT | `/api/config/boxes/:id` | Update box |
| POST | `/api/config/boxes/:id/assign` | Assign staff to box |
| DELETE | `/api/config/boxes/:id/assign` | Unassign staff |
| GET | `/api/config/boxes/:id/history` | Assignment history |
| GET | `/api/config/system` | All system config key-values |
| PUT | `/api/config/system` | Update system config key |
| POST | `/api/config/reload` | Hot-reload config from DB |

## Docker
```bash
# NOTA: El usuario usa Podman, NO docker. No usar el contexto docker.
podman build --no-cache -t mediqueue:latest .
podman compose up -d
podman compose --profile test up -d     # + test DB on :5433
```
- Multi-stage Dockerfile: Stage 1 builds frontend (Vite), Stage 2 copies `frontend/dist/` and runs backend.
- In production (`NODE_ENV=production`), server.js serves `frontend/dist/` statically and falls back to `index.html` for SPA routes.
- `docker-compose.yml` sets `NODE_ENV=production` by default.
- `.dockerignore` excludes `node_modules/`, `.env`, `tests/`, `coverage/`.

## Seed test users
| User | Password | Role |
|---|---|---|
| `admin` | `Admin1234!` | Administrador (all permissions) |
| `doctor1` | `password123` | Médico |
| `nurse1` | `password123` | Enfermera |
| `manager1` | `password123` | Gerente |

## Env requirements
- `DATABASE_URL` and `JWT_SECRET` (min 32 chars) are required; server exits without them.
- Full env reference in `.env` file.

## Compliance ARCO (Ley 21.719 Chile)
- DELETE does NOT physically delete — it **anonymizes** (`name='ANONIMIZADO'`, `phone=NULL`).
- GET /export returns a downloadable JSON with `Content-Disposition: attachment`.
- All compliance endpoints rate-limited to 10 requests/15min per IP.

## Production hardening applied (June 2026)
1. `.dockerignore` created — prevents secrets leaking into build context
2. winston logger configured — structured JSON logging, respects `LOG_LEVEL`
3. morgan middleware — HTTP access log via winston
4. helmet CSP enabled — strict Content-Security-Policy headers
5. `SIGINT` handler added — graceful shutdown on Ctrl+C
6. SQL injection fix — `INTERVAL '${historyDays} days'` → parameterized `$2::INTERVAL`
7. Error handling unified in `routes/config.js` — all routes now use `next(err)` instead of `res.status(500).json()`
8. `requireManager` uses permission-based check (`manage_config`) instead of hardcoded role list
9. Compliance endpoints rate-limited (10 req/15min per IP)
10. React ErrorBoundary wraps entire app
11. Admin UI with CRUD for Establishments, Services, Boxes, Roles, Users, System Config
