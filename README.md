# CUE — Command Understanding Engine

A personal command-layer assistant with a real Node.js backend, file-based JSON storage, bcrypt authentication, and a clean professional UI.

---

## Project Structure

```
cue-app/
├── server.js                  ← Express backend (all API routes)
├── package.json
│
├── data/                      ← JSON data layer (one file per purpose)
│   ├── users.json             ← Auth records (hashed passwords, roles)
│   ├── memory.json            ← CUE command database (keywords + responses)
│   ├── logs.json              ← Audit log (every user action)
│   ├── settings.json          ← App-wide configuration
│   └── profiles/
│       └── [username].json    ← Per-user profile (age, bio, fav_things, etc.)
│
└── public/                    ← Frontend (served statically)
    ├── login.html
    ├── signup.html
    ├── dashboard.html
    ├── admin.html
    ├── css/
    │   └── main.css           ← Design system (tokens, components)
    └── js/
        ├── icons.js           ← SVG icon library (zero emojis)
        └── api.js             ← Fetch client + UI helpers
```

---

## JSON Files — Purpose

| File | Contains | Written by |
|---|---|---|
| `users.json` | user_id, username, hashed password, role, created_at | Auth routes |
| `memory.json` | CUE commands: trigger, keywords[], response, type | Users + Admin |
| `logs.json` | Timestamped audit trail of every action | All routes |
| `settings.json` | App name, registration toggle, memory limits | Admin panel |
| `profiles/[name].json` | display_name, age, bio, location, fav_things, theme_color | Profile route |

---

## Setup

**Requirements:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
http://localhost:3000
```

The server auto-creates an admin account on first run:

```
username: admin
password: admin123
```

---

## API Reference

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Login with username + password |
| POST | `/api/auth/signup` | Create a new account |
| POST | `/api/auth/logout` | End session |
| GET  | `/api/auth/me` | Get current session user |

### Profile
| Method | Route | Description |
|---|---|---|
| GET | `/api/profile` | Get current user's profile |
| PUT | `/api/profile` | Update profile fields |

### CUE / Memory
| Method | Route | Description |
|---|---|---|
| GET    | `/api/memory` | List all memory commands |
| POST   | `/api/memory` | Add a new command |
| PUT    | `/api/memory/:id` | Edit a command (admin only) |
| DELETE | `/api/memory/:id` | Delete a command |
| POST   | `/api/cue/process` | Send input → get CUE response |

### Admin (admin role required)
| Method | Route | Description |
|---|---|---|
| GET    | `/api/admin/stats` | System overview numbers |
| GET    | `/api/admin/users` | All users with profiles |
| POST   | `/api/admin/users` | Create a user |
| DELETE | `/api/admin/users/:id` | Delete a user |
| PATCH  | `/api/admin/users/:id/role` | Change role |
| GET    | `/api/admin/logs` | Activity log |
| GET    | `/api/admin/settings` | Read settings |
| PUT    | `/api/admin/settings` | Save settings |

---

## CUE Auto-responses

Special response values in `memory.json` that resolve at request time:

| Value | Output |
|---|---|
| `auto:time` | Current local time |
| `auto:date` | Full date string |
| `auto:status` | Server uptime, user count, memory count |

---

## How the Memory System Works

1. User sends a message via the dashboard
2. `POST /api/cue/process` scans `memory.json` for keyword matches
3. **Match found** → response returned immediately
4. **No match** → `{ found: false }` returned → dashboard shows "Add command?" modal
5. User fills in keywords + response → saved to `memory.json` with type `custom`, label `user-added`
6. Every step is logged to `logs.json`

---

## Security

- Passwords hashed with **bcrypt** (cost factor 10)
- Sessions via **cookie-session** (signed, HTTP-only)
- Admin routes protected by role check middleware
- Users cannot delete their own account or change their own role
- Built-in memory commands are protected from non-admin deletion

---

## Pages

| Page | Route | Access |
|---|---|---|
| Login | `/login.html` | Public |
| Sign Up | `/signup.html` | Public |
| Dashboard | `/dashboard.html` | Authenticated |
| Admin | `/admin.html` | Admin only |
