# 🏥 MediQueue — Sistema de Gestión de Colas Hospitalarias

Sistema completo de gestión de colas para entornos hospitalarios con cartelería digital.
![CI](https://github.com/tu-usuario/mediqueue/actions/workflows/ci.yml/badge.svg)
## ✨ Características

| Módulo | Descripción |
|--------|-------------|
| 🎫 **Check-in** | Kiosco web para registro de pacientes (walk-in y con cita) |
| ⚡ **Priorización** | Emergencia → Cita → Walk-in, con tiempo de espera real |
| 👨‍⚕️ **Consola Staff** | Llamar, completar, marcar ausente, transferir entre servicios |
| 📺 **Cartelería** | Pantalla digital con tickets en tiempo real vía WebSocket |
| 📊 **Analytics** | Dashboard con tiempos promedio, no-shows y carga por servicio |
| ⚖️ **Compliance** | Endpoints ARCO (Ley 21.719 Chile) integrados |
| 🔒 **Seguridad** | JWT + bcrypt + roles dinámicos + rate limiting |

## 🚀 Inicio Rápido

### Opción A — Docker (recomendado)

```bash
git clone https://github.com/peimando/mediqueue.git
cd mediqueue
cp .env.example .env        # editar JWT_SECRET mínimo
docker-compose up -d        # levanta app + postgres + redis
```

El servidor estará en `http://localhost:3000`.  
Las migraciones corren automáticamente al iniciar.

### Opción B — Local

**Requisitos:** Node.js 18+, PostgreSQL 15+

```bash
npm install
cp .env.example .env
# Editar .env con tu DATABASE_URL y JWT_SECRET

npm run migrate             # crear tablas
npm run seed                # datos de prueba
npm start                   # o: npm run dev
```

## 🔑 Usuarios de Prueba

| Usuario | Contraseña | Rol | Servicio |
|---------|-----------|-----|---------|
| `admin` | `Admin1234!` | Administrador | — |
| `doctor1` | `password123` | Médico | Consultoría |
| `nurse1` | `password123` | Enfermera | Triage |
| `pharmacist1` | `password123` | Farmacéutico | Farmacia |
| `manager1` | `password123` | Gerente | — (analytics) |

## 📡 API — Endpoints principales

### Públicos (sin auth)
```
GET  /health                          Healthcheck
GET  /api/config/public               Servicios y tipos de paciente
POST /api/patients                    Registrar paciente (check-in)
GET  /api/tickets/:code               Seguimiento público de ticket
```

### Staff (requiere JWT)
```
POST /api/auth/login                  Login
GET  /api/auth/me                     Usuario actual

GET  /api/services/:id/queue          Cola del servicio
POST /api/services/:id/call-next      Llamar siguiente
POST /api/services/:id/complete/:pid  Completar atención
POST /api/services/:id/absent/:pid    Marcar ausente
POST /api/patients/:id/transfer       Transferir a otro servicio
```

### Gerencia
```
GET  /api/analytics/daily             Dashboard del día
GET  /api/users                       CRUD usuarios
POST /api/users/roles                 CRUD roles
```

### Compliance ARCO
```
GET    /api/compliance/my-data        Ver datos propios
DELETE /api/compliance/my-data        Anonimizar datos
GET    /api/compliance/export         Portabilidad (descarga JSON)
```

## 🗄️ Base de Datos

```
patients         → tickets y estado de atención
services         → Triage, Consultoría, Lab, Rayos X, Farmacia
patient_types    → emergency | appointment | walkin
staff + roles    → usuarios con permisos dinámicos
boxes            → consultorios y ventanillas
ticket_sequences → correlativos atómicos por servicio/día
system_config    → parámetros sin hardcodear
sms_templates    → mensajes SMS configurables
audit_logs       → trazabilidad de acciones
```

## 🧪 Tests

```bash
npm test                    # tests unitarios
npm run test:integration    # tests contra BD real (requiere docker-compose --profile test up -d)
npm run test:all            # todos
```

Los tests de integración usan una BD aislada en puerto 5433 (ver `docker-compose.yml`).

## ⚙️ Variables de Entorno

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Secreto JWT (mín. 32 chars) |
| `REDIS_HOST` | — | localhost | Host Redis |
| `REDIS_PORT` | — | 6379 | Puerto Redis |
| `PORT` | — | 3000 | Puerto del servidor |
| `CORS_ORIGIN` | — | * | Origen permitido CORS |

## 🏗️ Arquitectura

```
Frontend React (Vite) ──→ nginx / directo
                              ↓
                    Node.js + Express + Socket.io
                         ↙            ↘
                   PostgreSQL         Redis (cache)
```

**Concurrencia:** `SELECT FOR UPDATE SKIP LOCKED` garantiza que dos staff que presionen "Llamar Siguiente" simultáneamente nunca obtengan el mismo paciente.

**Tickets atómicos:** función PostgreSQL `next_ticket_seq()` asegura correlativos sin huecos incluso con 50 registros en paralelo.

## 📁 Estructura del Proyecto

```
mediqueue/
├── server.js                   ← entrada principal
├── routes/
│   ├── users.js                ← CRUD usuarios y roles
│   ├── config.js               ← configuración paramétrica
│   └── compliance.js           ← ARCO / Ley 21.719
├── src/
│   ├── config/
│   │   ├── loader.js           ← fuente única de verdad
│   │   └── env.js              ← validación de entorno
│   ├── errors/AppError.js      ← errores tipados
│   ├── services/
│   │   └── queueService.js     ← lógica de cola (SKIP LOCKED)
│   └── sockets/asyncSocket.js  ← WebSocket handlers
├── migrations/
│   ├── 001_init.sql            ← schema completo
│   └── run.js                  ← runner de migraciones
├── scripts/
│   └── seed.js                 ← datos de prueba
├── tests/
│   ├── unit/errors.test.js     ← tests unitarios
│   └── integration/queue.test.js ← tests contra BD real
├── frontend/src/App.jsx        ← React frontend completo
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## 🔄 Flujo de un Paciente

```
1. Paciente llega → POST /api/patients → ticket TRI-001
2. Personal ve cola → GET /api/services/1/queue
3. Llama siguiente → POST /api/services/1/call-next
   └─ SKIP LOCKED evita doble asignación
4. Atiende → POST /api/services/1/complete/:id
5. Cartelería → WebSocket display_update cada 2s
6. Analytics → /api/analytics/daily con datos reales de BD
```

## 📜 Licencia

MIT
