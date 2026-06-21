# ============================================================
# Stage 1: Build frontend (Vite + React + Tailwind)
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build

COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

COPY frontend/ frontend/
RUN cd frontend && npm run build

# ============================================================
# Stage 2: Backend + serve frontend
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Backend dependencies
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline || npm install --omit=dev

# Backend source
COPY . .

# Built frontend
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Logs + uploads directories
RUN mkdir -p logs uploads/displays

# curl para healthcheck (docker-compose define el test)
RUN apk add --no-cache curl

# Non-root user
RUN addgroup -S mediqueue && adduser -S mediqueue -G mediqueue
RUN chown -R mediqueue:mediqueue /app
USER mediqueue

EXPOSE 3000

CMD ["node", "server.js"]
