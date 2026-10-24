# Interview Management Platform

Enterprise interview platform foundation with **Authentication + RBAC** as Module 1.

## Stack

- **Backend:** NestJS, Prisma, MongoDB, JWT (access + refresh)
- **Frontend:** React, Vite, React Router
- **Infra:** Docker Compose (MongoDB replica set, coturn, S3, Mailpit)

Architecture, module boundaries and conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Prisma models live one-per-file under `backend/prisma/schema/`, with snake_case
fields (`created_at`, `recorded_by_id`).

## Prerequisites

- **Node.js 20+** (developed on 22.11) and npm
- **Docker Desktop** (MongoDB replica set — Prisma needs a replica set for nested writes)

## Quick start

### 1. Database

```bash
docker compose up -d
```

Wait until `imp-mongo` is healthy. The same compose file also starts:

- **coturn** on port `3478` so live calls can relay when a direct connection fails
- **S3** on `http://127.0.0.1:9090` for recordings
- **Mailpit** on `http://127.0.0.1:8025` so scheduled, updated, and cancelled interview emails can be read locally

Connection string (already in `backend/.env.example`):

`mongodb://127.0.0.1:27017/interview_platform?replicaSet=rs0`

### 2. Backend

```bash
cd backend
copy .env.example .env      # macOS/Linux: cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed
npm start
```

API: `http://localhost:3000/api/v1`

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

App: `http://localhost:5173`

`frontend/.env` must contain `VITE_API_BASE_URL=http://localhost:3000/api/v1`.

## Moving the project to another machine

Copy the whole folder **except** the generated directories — `node_modules` contains
native binaries (`bcrypt`) and a platform-specific Prisma client, so it must be
reinstalled rather than copied.

Skip: `backend/node_modules`, `frontend/node_modules`, `backend/dist`,
`frontend/dist`, `backend/uploads`.

```powershell
robocopy E:\interview-management-platform D:\transfer\interview-management-platform /E `
  /XD node_modules dist uploads .vite
```

Then run the three quick-start steps above on the new machine. The database itself
does not travel with the files — the seed recreates the demo company, roles, users,
questions and sample interviews. To carry real data over, use
`docker exec imp-mongo mongodump --db interview_platform --out /tmp/dump` and copy
the dump to the new machine.

### Common issues

| Symptom | Fix |
| --- | --- |
| `EADDRINUSE :3000` | Another API instance is running — stop it or change `PORT` in `backend/.env` |
| `Can't reach database server` | `docker compose up -d`, wait for the healthcheck to pass |
| `EPERM` during `prisma generate` | Stop the running backend first, then regenerate |
| CORS errors in the browser | `FRONTEND_URL` in `backend/.env` must match the Vite origin exactly |
| Camera/mic blocked when opening the app from another device over LAN | `getUserMedia` requires a secure context — use `localhost`, HTTPS, or a tunnel such as `ngrok` |
| Live call connects on one machine and fails for a remote candidate | Set `TURN_PUBLIC_IP` to this machine's reachable address, then `docker compose up -d` so coturn advertises it. Match `TURN_URLS` in `backend/.env` |

## Demo accounts

| Email | Role | Password |
| --- | --- | --- |
| `superadmin@platform.com` | Super Admin | `Password@123` |
| `admin@acme.com` | Company Admin | `Password@123` |
| `hr@acme.com` | HR | `Password@123` |
| `interviewer@acme.com` | Interviewer | `Password@123` |
| `candidate@acme.com` | Candidate | `Password@123` |

## Auth APIs

| Method | Endpoint | Auth |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Public |
| POST | `/api/v1/auth/logout` | Public (refresh token body) |
| POST | `/api/v1/auth/refresh-token` | Public |
| POST | `/api/v1/auth/forgot-password` | Public |
| POST | `/api/v1/auth/reset-password` | Public |
| POST | `/api/v1/auth/change-password` | JWT |
| GET | `/api/v1/auth/profile` | JWT |

## Live Interview APIs

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET | `/api/v1/live-interviews` | `LiveInterview.Join` |
| GET | `/api/v1/live-interviews/interviewers` | `Interview.Create` |
| POST | `/api/v1/live-interviews` | `Interview.Create` |
| GET | `/api/v1/live-interviews/:id` | `LiveInterview.Join` |
| POST | `/api/v1/live-interviews/:id/join` | `LiveInterview.Join` |
| POST | `/api/v1/live-interviews/:id/media-check` | `LiveInterview.Join` |
| POST | `/api/v1/live-interviews/:id/start` | `LiveInterview.Join` |
| POST | `/api/v1/live-interviews/:id/recording` | `LiveInterview.Record` |
| POST | `/api/v1/live-interviews/:id/feedback` | `Interview.Feedback` |
| POST | `/api/v1/live-interviews/:id/complete` | `LiveInterview.Join` |
| POST | `/api/v1/live-interviews/:id/leave` | `LiveInterview.Join` |

WebRTC signaling: Socket.IO namespace `/live` (JWT via `auth.token`). Media uses STUN plus the coturn TURN relay from `GET /api/v1/live-interviews/ice-servers`.

### Live interview UI flow

1. Open **Live Interview** in the app
2. HR creates a session (or use the seeded demo). The candidate receives an email in Mailpit
3. Interviewer and candidate open the lobby and check camera and microphone
4. Enter the room. The call connects directly when it can, and through TURN when it cannot
5. Start the interview. The host records the conversation. The candidate's own camera is saved separately
6. Complete the interview. The candidate is removed from the room and the invite stops working
7. Review shows both recordings. Cancel from Interview Management closes the live and technical links and emails the candidate

An interviewer cannot be booked for two interviews that overlap. Technical review lists anti-cheat warnings as a signal, not as proof.

## Login response shape

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "userId": "...",
      "firstName": "Helen",
      "lastName": "HR",
      "email": "hr@acme.com",
      "role": "HR",
      "permissions": ["Interview.Create", "Interview.View", "Interview.Edit"]
    }
  }
}
```

## Roles

- **Super Admin** — full platform
- **Company Admin** — full company
- **HR** — interviews + candidates
- **Interviewer** — conduct + feedback
- **Candidate** — attend assigned interviews

Dashboard navigation is filtered by the authenticated user's permissions.

## Modules

Interview Management, Live Interview, Technical Interview, Candidates, Question Bank, Reports, Users, and Settings are in the app. Recordings go to the local S3 service when `S3_ENDPOINT` is set, and older files still play from `backend/uploads`.
