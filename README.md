# Sar7ny API (صارحني)

Backend for an **anonymous messaging** app: users share a public username,
strangers send them anonymous messages, and admins moderate reports.

Built with **Node.js + Express + MongoDB (Mongoose) + JWT + Zod**.

---

## 1. Features

- **Auth & Session Management**:
  - Short-lived **Access Token** (JWT, HS256, issuer + audience checked).
  - **Refresh Token** (opaque, stored only as a SHA-256 hash) with **rotation** and **reuse detection**.
  - **Single Device Logout (`/auth/logout`)**: Revokes the active refresh token and blacklists it in Redis.
  - **All Devices Logout (`/auth/logout-all`)**: Revokes all refresh tokens, increments the user's `tokenVersion` / `passwordChangedAt`, and invalidates active session keys in Redis across all devices.
  - **Sign in with Google** (OAuth 2.0 / OpenID Connect, `state` + PKCE + `nonce`, server-side ID-token verification) with interactive account picker menu, popup mode with cross-window broadcast handoff, and explicit account linking/unlinking.
- **Security & Integrity**:
  - **Magic Number File Inspection**: Avatar uploads through Multer are verified against real binary signature bytes (PNG, JPEG, GIF, WebP), rejecting polyglots, tampered scripts, or executables disguised as images.
  - **Redis Layer**: Integrated Upstash Redis service for instant token revocation, blacklisting, session synchronization, and system caching.
  - Helmet, strict CORS allow-list, body limits, request IDs, NoSQL-injection sanitization, strict Zod validation, and per-route rate limiting.
- **Users & Profile**:
  - Public profile with dynamic QR Code sharing & downloading.
  - Avatar image uploads (`multipart/form-data`) with strict binary verification and auto-cleanup of previous files.
  - Password change with instant session revocation, profile update, and soft deletion retention policy.
- **Email Confirmation (OTP)**:
  - 6-digit numeric OTP codes sent over SMTP (`/confirm-email/send` and `/confirm-email/verify`).
- **Messages & Feedback**:
  - Anonymous messaging (no sender identity stored at all), cursor-paginated inbox with unread/archived filters.
  - Useful Honesty & Guided Feedback: custom reception prompts, feedback mirror sentiment insights, and personal goals tracking (`/feedback/*`).
- **Reports & Moderation**:
  - Anonymous and authenticated reporters, flood control, admin moderation with audit trail.
- **Admin Control Center**:
  - Multi-tab management: platform metrics & counters, paginated user management with search and role filters, user role elevation/demotion, remote session revocation, admin password reset, abuse report moderation, audit logs, and real-time **System & Redis Health** diagnostics with one-click cache flushing.

---

## 2. Requirements

- Node.js **>= 18** (developed on 22)
- MongoDB **>= 6** (local or Atlas)
- Redis / Upstash Redis (optional but recommended for distributed token blacklisting & caching)
- npm >= 9

---

## 3. Installation

```bash
npm install
cp .env.example .env      # then fill in the values
```

---

## 4. Environment variables

All variables are declared in [`.env.example`](.env.example).
Startup **fails fast in production** if a required variable is missing; the
error lists the missing names only (never their values).

| Variable | Required | Default (dev/test) | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | prod | `development` | `development` / `test` / `production` |
| `PORT` | no | `3000` | HTTP port |
| `MONGODB_URI` | **yes** | local `sarhny_dev` | Database connection string |
| `JWT_ACCESS_SECRET` | **yes** | dev-only value | Access token signing secret |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | Access token lifetime |
| `JWT_REFRESH_SECRET` | **yes** | dev-only value | Refresh token secret |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh token lifetime |
| `JWT_ISSUER` / `JWT_AUDIENCE` | no | `sarhny-api` / `sarhny-app` | JWT claims verified on every request |
| `CLIENT_ORIGIN` | prod | `http://localhost:5173` | Comma-separated CORS allow-list |
| `CLIENT_URL` | no | `http://localhost:5173` | Frontend URL for email links |
| `UPSTASH_REDIS_REST_URL` | no | – | Upstash Redis REST URL for session blacklist & cache |
| `UPSTASH_REDIS_REST_TOKEN` | no | – | Upstash Redis REST token |
| `SMTP_HOST` / `SMTP_PORT` | no | `smtp.gmail.com` / `587` | SMTP mail server for OTP verification |
| `SMTP_SECURE` | no | `false` | TLS/SSL toggle for SMTP |
| `SMTP_USER` / `SMTP_PASS` | no | – | SMTP authentication credentials |
| `MAIL_FROM` | no | `Sar7ny <no-reply@sarhny.local>` | Outgoing mail sender signature |
| `OTP_LENGTH` / `OTP_TTL_MINUTES` | no | `6` / `15` | Verification OTP settings |
| `BCRYPT_ROUNDS` | no | `10` | Password hashing cost |
| `PASSWORD_RESET_TTL_MINUTES` | no | `15` | Reset token lifetime |
| `MAX_MESSAGES_PER_RECIPIENT_PER_DAY` | no | `20` | Per-recipient flood control |
| `MAX_REPORTS_PER_FINGERPRINT_PER_DAY` | no | `5` | Per-source report flood control |
| `DELETED_ACCOUNT_RETENTION_DAYS` | no | `30` | Retention window after account deletion |
| `FINGERPRINT_SALT` | prod | dev-only value | Salt for anonymous fingerprints |
| `RATE_LIMIT_ENABLED` | no | `true` | Master switch for rate limiting |
| `RATE_LIMIT_*` | no | see `.env.example` | Window + per-route limits |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | no | – | Google OAuth credentials (required to enable Google sign-in) |
| `OAUTH_COOKIE_SECRET` | prod* | dev-only value | HMAC key for the short-lived OAuth flow cookie |
| `OAUTH_REDIRECT_URL` | no | `http://localhost:5173/auth/google/callback` | SPA landing page for redirect/handoff exchange |
| `OAUTH_FLOW_TTL_MS` / `OAUTH_HANDOFF_TTL_MS` | no | `600000` / `60000` | OAuth state and handoff lifetimes |

> Never commit a real `.env`. It is already listed in `.gitignore`.

---

## 5. Running

```bash
npm run dev        # nodemon, auto-reload
npm start          # production
npm test           # vitest + supertest (uses the sarhny_test database)
npm run admin:create   # create/promote the first admin (see section 9)
```

Health check: `GET /health` → `{ "success": true, "data": { "status": "ok", ... } }`

### 5.1 Frontend (React client in `client/`)

A complete Vite + React 19 SPA that drives the whole API lives in `client/`.

```bash
cd client
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle -> client/dist
npm run preview    # serve the built bundle on :5174
```

Keep the API running in a second terminal (`npm run dev` at the repo root).

**CORS.** The client calls the API on its own origin (no dev proxy), so the
server must allow-list the client origin. `CLIENT_ORIGIN` already defaults to
`http://localhost:5173`, and the API answers with
`Access-Control-Allow-Origin: <that origin>` +
`Access-Control-Allow-Credentials: true`. A proxy would break the Google
OAuth flow cookie (it is scoped to the API host), which is why none is used.

**What the client covers**

| Route | Page |
| --- | --- |
| `/` | Landing + anonymous recipient lookup |
| `/u/:username` | Public profile + anonymous composer (or a preview note when it is your own page) |
| `/login`, `/register` | Email/username + password, and Google sign-in |
| `/inbox` | Inbox with unread/archived tabs, mark-read, archive, delete, report |
| `/settings` | Public profile, Google link/unlink, password change, account deletion |
| `/auth/google/callback` | Handoff exchange for the redirect-mode Google flow |
| `/admin` | Stats, users (enable/disable), reports, audit log — admin only |

**Session handling.** The access token lives in `localStorage` and is renewed
automatically. Renewal is single-flight inside a tab and coordinated across
tabs through a `localStorage` lock, because the backend treats a replayed
refresh token as theft and revokes the whole session chain — two tabs must
never rotate concurrently. On boot the client rotates once and revalidates
with `GET /auth/me`; nothing is requested when no refresh token is stored.

**Two supporting changes on the API side**

- `.env` must contain `OAUTH_REDIRECT_URL=http://localhost:5173/auth/google/callback`
  so the callback 302s to the SPA with `?handoff=<code>` instead of returning
  tokens as JSON in the browser. See §10.2.
- `GET /api/v1/reports` and `GET /api/v1/reports/:id` now also return
  `messageContent` / `messageCreatedAt`. The service already populated the
  reported message for moderation but `presentReport` discarded the content by
  stringifying `_id`, so moderators could see only an identifier. This is
  purely additive — `message` still holds the identifier.

---

## 6. Project structure

```
src/
├── config/          env validation, database
├── constants/       roles, report reasons, error codes/messages
├── models/          Mongoose schemas + indexes (User, Message, Report,
│                    PasswordResetToken, OAuthAccount, OAuthHandoff,
│                    RefreshToken, AuditLog)
├── services/        all business logic (auth, user, message, report,
│                    password, token, admin, oauth, googleOidcClient,
│                    handoff)
├── controllers/     thin HTTP layer: read request -> call service -> respond
├── routes/          endpoints wired to controllers + validators + middleware
├── middleware/      auth, optionalAuth, admin, validate, rateLimit,
│                    error, notFound, requestId, requestLogger
├── validators/      Zod schemas (strict: unknown fields are rejected)
├── utils/           AppError, asyncHandler, tokens, hashing, oauthFlow,
│                    sanitizeUser, pagination
├── app.js           Express assembly — NO db connection, NO listen()
└── server.js        env validation -> db connect -> listen -> graceful shutdown
tests/               vitest + supertest (auth, users, messages, reports,
                     passwords, security, oauth)
scripts/createAdmin.js

client/              Vite + React 19 SPA (see §5.1)
├── src/lib/         api client (auto-refresh + cross-tab lock), auth context,
│                    formatting helpers
├── src/components/  app shell, protected routes, avatar, toasts, modal, ...
└── src/pages/       home, profile, login/register, inbox, settings, admin,
                     google callback, 404
```

Design rules applied everywhere:

- **`app.js` has no side effects** so tests import it and drive it with
  supertest without opening a port or touching the DB connection lifecycle.
- **Controllers stay thin**; services hold the logic.
- **Validators use `.strict()`**, so unknown fields (e.g. `role`,
  `isActive`, `isVerified`) are rejected with `400 VALIDATION_ERROR`.
- **Services re-check authorization** even when the route already has a
  guard (defence in depth).

---

## 7. API

Base path: **`/api/v1`**
Auth: **`Authorization: Bearer <accessToken>`**

### Postman collection

[`sarhny-api.postman_collection.json`](sarhny-api.postman_collection.json) covers **all 48 endpoints** in
10 folders:
1. **00 Health & Docs**: System health and OpenAPI contract
2. **01 Auth**: Register, login, refresh, single-device logout, all-device logout, current user
3. **02 Google OAuth**: Start flow, callback, handoff exchange, link/unlink providers
4. **03 Users**: Profile self-service, avatar upload (binary magic numbers), password change, deletion, public profile
5. **04 Messages**: Anonymous sending, cursor inbox, mark-read, archive, logical delete
6. **05 Reports**: Message abuse reports, admin review, status moderation
7. **06 Password**: Forgot password, one-time reset token verification
8. **07 Admin**: Multi-tab control center, user inspection & role elevation, admin password reset, remote session revocation, audit trail, reports moderation, real-time Redis latency & system health, cache purge
9. **08 Confirm Email (OTP)**: Send 6-digit confirmation OTP over SMTP, verify code
10. **09 Feedback (Honesty & Goals)**: Message reception toggle, custom guided prompts, sentiment mirror insights, personal goal tracking

Import it into Postman, then:

1. Run **01 Auth → Register** (or **Login**).
2. The response scripts store `accessToken`, `refreshToken`, `userId` and
   `username` as collection variables, so every bearer request works right
   away.
3. Set `recipientUsername` to an account you control, send an anonymous
   message, then read `data.messages[0]._id` from **List my inbox** into
   `{{messageId}}`. Do the same with `data.report.id` for `{{reportId}}`.

---

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | – | Create account (role is always `user`) |
| POST | `/login` | – | Login with `identifier` (email **or** username). 5 failed password attempts trigger 5-minute ban. If 2FA enabled, sends OTP |
| POST | `/login-confirm` | – | Complete 2-step-verification login with 6-digit OTP code |
| POST | `/2fa/send-otp` | ✅ | Send 6-digit OTP code to email to initiate enabling 2FA |
| POST | `/2fa/verify-enable` | ✅ | Verify OTP code and enable 2-step-verification (`twoFactorEnabled: true`) |
| POST | `/2fa/disable` | ✅ | Disable 2-step-verification |
| POST | `/refresh` | – | Rotate refresh token, new pair issued |
| POST | `/logout` | ✅ | Revoke active refresh token on current device |
| POST | `/logout-all` | ✅ | Revoke all refresh tokens & drop sessions across all devices |
| GET | `/me` | ✅ | Current user (sanitized) |

---

### Google sign-in — `/api/v1/auth/google`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | – | Starts flow: `?login_hint=...&prompt=...&popup=1`, sets flow cookie, 302s to Google |
| GET | `/callback` | – | Google redirects here; verifies state, PKCE, nonce; redirects to SPA with handoff |
| POST | `/exchange` | – | `{ handoff }` → token pair (redirect mode) |
| POST | `/link` | ✅ | `{ authorizationUrl }` — start linking Google to authenticated account |
| GET | `/links` | ✅ | Linked providers list + `hasPassword` |
| DELETE | `/link` | ✅ | Unlink Google account |

---

### Users — `/api/v1/users`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/:username` | – | Public profile (username, name, bio, avatar, createdAt) |
| PATCH | `/me` | ✅ | Update `name` / `bio` only |
| PATCH | `/me/avatar` | ✅ | Upload profile picture (`multipart/form-data`, magic bytes verified) |
| PATCH | `/me/password` | ✅ | Change password → revokes sessions |
| DELETE | `/me` | ✅ | Soft delete account with data retention policy |

---

### Email Confirmation (OTP) — `/api/v1/confirm-email`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/send` | ✅ | Send 6-digit confirmation OTP to user email via SMTP |
| POST | `/verify` | ✅ | Verify OTP code and activate `isVerified: true` |

---

### Messages — `/api/v1/messages`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/:username` | – | Send anonymous message (no sender identity stored) |
| GET | `/` | ✅ | Own inbox — cursor pagination + filters (`isRead`, `isArchived`) |
| GET | `/:id` | ✅ | Single message (owner only) |
| PATCH | `/:id/read` | ✅ | Mark as read |
| PATCH | `/:id/archive` | ✅ | Archive / unarchive |
| DELETE | `/:id` | ✅ | Logical delete |

---

### Useful Honesty & Feedback — `/api/v1/feedback`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/reception` | ✅ | Read message reception settings |
| PUT | `/reception` | ✅ | Update reception policy |
| PUT | `/reception/prompts` | ✅ | Set custom guided questions for senders |
| GET | `/mirror` | ✅ | Feedback mirror sentiment analysis |
| GET | `/goals` | ✅ | List personal feedback goals |
| POST | `/goals` | ✅ | Create personal feedback goal |
| GET | `/goals/due` | ✅ | List due or overdue goals |
| GET | `/goals/:id` | ✅ | Get single goal details |
| PATCH | `/goals/:id` | ✅ | Update goal status or fields |
| DELETE | `/goals/:id` | ✅ | Delete feedback goal |

---

### Admin — `/api/v1/admin` (admin role required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/stats` | Instance counters (users, messages, reports) |
| GET | `/users` | Paginated users list with `search` & `role` filters |
| GET | `/users/:id` | Get full user details |
| PATCH | `/users/:id` | `{ isActive: true\|false }` — enable/disable account |
| PATCH | `/users/:id/role` | Change role between `user` and `admin` |
| PATCH | `/users/:id/password` | Reset user password directly |
| POST | `/users/:id/revoke-sessions` | Force logout user across all devices |
| DELETE | `/users/:id` | Soft/hard delete user account |
| GET | `/reports` | List abuse reports with `status` filter |
| PATCH | `/reports/:id` | Moderate report (`reviewed`, `dismissed`) |
| GET | `/audit-logs` | Security audit trail with `action` filter |
| GET | `/system` | Real-time Redis latency & status, MongoDB, memory, uptime |
| POST | `/system/flush-cache` | Safely clear non-persistent Redis cache |

---

## 8. Security model

- **Password storage**: bcrypt (cost from `BCRYPT_ROUNDS`), `select:false`.
- **Access tokens**: HS256 with `issuer` + `audience` + `algorithm`
  verification; 15-minute default lifetime.
- **Refresh tokens & session revocation**: opaque 48-byte random strings, stored **only** as
  SHA-256 digests, rotated on every use.
  - **Single Device Logout**: blacklists the specific refresh token in Redis.
  - **All Devices Logout**: increments the user's `tokenVersion` / `passwordChangedAt` and invalidates active session keys in Redis, dropping all concurrent sessions across any device or browser.
  - Presenting a revoked token triggers reuse detection, revoking the entire session chain and writing an audit log entry.
- **Avatar Magic Number Byte Inspection**: File uploads are not trusted by MIME headers or file extensions alone. Uploaded avatars are inspected for exact Magic Number header signatures (PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`, WebP `52 49 46 46 ... 57 45 42 50`). Any polyglot, script, HTML, or executable disguised as an image is immediately rejected.
- **Password reset**: 32-byte random token, stored hashed, single-use via an
  atomic `findOneAndUpdate` (safe under concurrency), validated against
  `expiresAt` + `usedAt` at use time (TTL deletion alone is not trusted
  because MongoDB TTL sweeps are not immediate).
- **Anonymous messages**: the `Message` schema has **no sender field** —
  identity, IP and user agent are never persisted. `X-Forwarded-For` is not
  stored either; flood control uses a salted hash in memory only.
- **Account enumeration**: login returns an identical generic response for
  unknown accounts and wrong passwords; password-forgot answers every caller
  the same way (it is disabled, §11); message sending returns the same 404
  whether the recipient is missing or closed.
- **Authorization**: message/report access is scoped to the owner and
  returns `404` (not `403`) so ids cannot be probed.
- **NoSQL injection**: `$`-operators and dotted keys are stripped from
  body/query/params before validation.
- **Validation**: every route has a strict Zod schema; MongoDB queries are
  never built from raw client objects.
- **Rate limiting**: separate limiters for auth, messages, reports and
  password endpoints + a global safety net. The default in-memory store is
  per-process — **for multi-instance production deployments plug a shared
  store** (e.g. `rate-limit-redis`) via `createLimiter({ store })`.
- **Logs**: method, path, status, duration, request id only. No bodies, no
  tokens, no message content, no passwords.
- **Audit logs**: written for register, password change/reset, report
  moderation, account deletion and admin actions. Never contain secrets or
  message content; a TTL index enforces retention.
- **Google OAuth**: `state` (CSRF) + PKCE `code_verifier` + OIDC `nonce` travel
  in a **signed, HttpOnly, SameSite=Lax** cookie scoped to
  `Path=/api/v1/auth/google`. The authorization code is exchanged
  **server-side** with the redirect URI read from the environment only (never
  from the request), and the ID token is verified by `google-auth-library`
  against Google's public keys (signature + issuer + audience + expiry).
  **No auto-linking**: a Google identity whose verified email matches an
  existing password account returns `409 OAUTH_ACCOUNT_CONFLICT` — the user
  must sign in with their password and link explicitly, because local signups
  do not verify emails. An email is persisted only when Google reports it as
  verified; Google-only accounts store **no password**.
  The flow cookie is consumed on every callback, so a replayed callback fails
  the state check, and the fake/real authorization code is single-use.

### Account deletion policy

`DELETE /api/v1/users/me` (requires the current password):

1. The account is **soft-deleted** (`deletedAt` set, `isActive=false`).
2. Personal data is wiped: name → `Deleted user`, username/email/bio/avatar
   cleared, password replaced by an unusable random hash.
3. Received messages are **logically deleted** (hidden everywhere) and purged
   after `DELETED_ACCOUNT_RETENTION_DAYS`.
4. Reports filed by the user are **kept** for moderation integrity, but the
   `reporter` reference is detached (set to `null`).
5. Every refresh token is revoked; audit logs are retained until their own
   TTL expires.

---

## 9. Creating the first admin

Roles are never accepted from public routes, so the first admin is created
through a script that reads the password from the **environment** (not from
argv, which would leak it into the process list):

```bash
ADMIN_NAME="Admin" \
ADMIN_USERNAME="admin" \
ADMIN_EMAIL="admin@example.com" \
ADMIN_PASSWORD="StrongPass123" \
npm run admin:create
```

If the username already exists, it is promoted to `admin` instead of
failing. In production, delete the env values immediately afterwards.

---

## 10. Google sign-in (OAuth 2.0 / OpenID Connect)

The feature is **off until all three variables are set** — nothing is
half-enabled, and every endpoint answers `400 OAUTH_NOT_CONFIGURED` while it
is off.

### 10.1 Create the OAuth client in Google Cloud Console

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → Library** → enable **Google Identity API** (the
   "Sign in with Google" / OpenID Connect endpoints work without enabling a
   separate API, but enabling *Google Identity* keeps the console clean).
3. **APIs & Services → OAuth consent screen**
   - User type: **External** for a normal app (Internal only works inside a
     Google Workspace org).
   - Fill in the app name, support email and the scopes `openid`, `email`, `profile`.
   - **App Logo**: Google Cloud Console requires a square logo (120x120 px). Ready-to-upload files are located in the project root:
     - [`google-cloud-logo-120x120.png`](google-cloud-logo-120x120.png) (exact 120x120 px PNG for Google Cloud Console)
     - [`google-cloud-logo.png`](google-cloud-logo.png) & [`google-cloud-logo.jpg`](google-cloud-logo.jpg) (high-resolution branding assets)
   - While the app is in **Testing** status, only users you add as
     *test users* can sign in. Click **Publish app** for general use.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**.
   - Name it anything (e.g. `sarhny-local`).
   - **Authorised redirect URIs → Add URI** (this is the step that breaks
     most setups — the value must match **exactly**):

     ```
     http://localhost:3000/api/v1/auth/google/callback
     ```

     For a deployed instance use your real API origin:

     ```
     https://api.example.com/api/v1/auth/google/callback
     ```

   - Scheme (`http` vs `https`), host, port and trailing slash must all match
     `GOOGLE_REDIRECT_URI` character for character. `http://localhost:3000`
     and `http://127.0.0.1:3000` are **different** URIs.
5. Copy the generated **Client ID** and **Client Secret**.

### 10.2 Configure the API

```bash
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
OAUTH_COOKIE_SECRET=$(openssl rand -hex 32)
```

Restart the server. `npm start` refuses to boot in production if the Google
variables are present but `OAUTH_COOKIE_SECRET` is missing.

### 10.3 Run it locally

```bash
npm run dev
# then open in a browser:
open "http://localhost:3000/api/v1/auth/google"
```

You should land on Google's consent screen; after approving, Google sends the
browser back to `/api/v1/auth/google/callback`, which responds with the token
pair as JSON (or redirects to `OAUTH_REDIRECT_URL` when that is configured).

Verify the pieces individually:

```bash
# 1) starts the flow -> 302 to accounts.google.com + HttpOnly flow cookie
curl -s -D - -o /dev/null "http://localhost:3000/api/v1/auth/google" | grep -Ei 'HTTP|location|set-cookie'

# 2) callback without the cookie -> 400 OAUTH_STATE_MISMATCH (CSRF guard)
curl -s "http://localhost:3000/api/v1/auth/google/callback?code=x&state=aaa"

# 3) everything disabled -> 400 OAUTH_NOT_CONFIGURED
curl -s "http://localhost:3000/api/v1/auth/google"   # with the GOOGLE_* vars unset
```

### 10.4 Account linking policy

- A brand-new Google identity creates a **new** user (`authProvider: google`,
  no local password, `isVerified` taken from Google's `email_verified`).
- An identity that already has an `OAuthAccount` row logs straight in.
- **Email matching never links automatically.** If the Google email already
  belongs to a password account the API returns
  `409 OAUTH_ACCOUNT_CONFLICT` — sign in with the password first, then call
  `POST /api/v1/auth/google/link` while authenticated. Silent linking would be
  an account-takeover vector because local signups do not verify emails.
- Linking refuses when the Google identity is already linked to somebody else
  (`409 OAUTH_ALREADY_LINKED`) or when its verified email belongs to a
  different account (`409 OAUTH_ACCOUNT_CONFLICT`).
- Unlinking is refused when the user has no password
  (`400 OAUTH_LAST_LOGIN_METHOD`) so nobody can lock themselves out.

### 10.5 Failure handling

| Situation | Response |
| --- | --- |
| `state` missing / mismatched / cookie tampered | `400 OAUTH_STATE_MISMATCH` |
| Flow cookie older than `OAUTH_FLOW_TTL_MS` | `400 OAUTH_STATE_EXPIRED` |
| User cancelled consent (`error=access_denied`) | `400 OAUTH_ACCESS_DENIED` |
| Any other Google-reported error | `401 OAUTH_CODE_EXCHANGE_FAILED` |
| Bad / replayed authorization code | `401 OAUTH_CODE_EXCHANGE_FAILED` |
| ID token fails verification or nonce mismatch | `401 OAUTH_ID_TOKEN_INVALID` |
| `iss` hint is not Google | `401 OAUTH_ID_TOKEN_INVALID` |
| Email not verified by Google | `401 OAUTH_EMAIL_NOT_VERIFIED` |
| Disabled / soft-deleted account | `401 ACCOUNT_DISABLED` |
| Unknown or reused handoff code | `401 OAUTH_HANDOFF_INVALID` |
| Feature not configured | `400 OAUTH_NOT_CONFIGURED` |

**Honest status**: verified end-to-end against Google's real servers.

- 41 unit tests cover the flow with an injected fake OIDC client (real PKCE,
  single-use code, state/nonce, cancel, reuse, conflict).
- The live browser path was checked as far as the consent page: the client's
  button produces `client_id`, `response_type=code`, `code_challenge` (S256),
  `nonce`, `state`, `scope=openid email profile`, `prompt=select_account` and
  the registered `redirect_uri=http://localhost:3000/api/v1/auth/google/callback`.
- **A real sign-in completed.** A Google account now exists in the dev database
  (`authProvider: google`, `isVerified: true`) with an `OAuthAccount` row
  holding Google's real `sub`, plus an `auth.google_account_created` audit
  entry — created through the redirect + handoff + `POST /auth/google/exchange`
  path that `client/` implements.

Re-verify after any credential change by signing out and using
**"المتابعة باستخدام Google"** on `/login`; you should land on `/inbox` with a
new or existing account and see the link listed under `/settings`.

**Honest caveats**: the only Google account that has signed in so far is the
one that created this project. Account **linking** to a password account
(`POST /auth/google/link` → `/settings`) and **unlinking** are exercised only
by the fake-client tests and by the UI wiring — run one real
link + one real unlink before relying on them. Google-only accounts can now
adopt their first password (and then unlink) — see §14.

---

## 11. Email — removed; password recovery disabled

There is **no email subsystem in this project**: no SMTP settings, no mail
transport, no `nodemailer`, no templates. Nothing is ever sent anywhere, and
no `.env` variable for mail remains.

So `POST /api/v1/password/forgot` answers **`503 PASSWORD_RESET_DISABLED`**
to every caller — same status, same body, whether the account exists or not,
Google or local, password or no password. It cannot mint a token nobody could
read, and it still cannot be used to discover which accounts exist. The
explicit 503 (rather than a 404) lets a client tell "this feature is off"
from "this endpoint moved", and lets it be switched back on the moment a
delivery channel (email, SMS, WhatsApp) is reintroduced.

`POST /api/v1/password/reset` is unchanged: it is channel-agnostic and still
verifies any token it is handed — only the issuing half is off.

**A local account that loses its password currently has no self-service way
back in** (§14). A Google-linked account can still sign in with Google and
set a fresh password from Settings.

---

## 12. Tests

```bash
npm test          # single run
npm run test:watch
```

- Framework: **Vitest + Supertest** (the app is imported in-process; no port
  is opened).
- Database: **`sarhny_test`** — separate from development/production. The
  setup refuses to run if the URI does not contain `test`.
- Coverage: registration, duplicate username/email, password policy, login
  (success + generic failure), expired/forged tokens, refresh rotation and
  reuse detection, logout, profile visibility, profile update restrictions
  (role/isActive/isVerified rejected), password change + session revocation,
  account deletion, message sending/validation, ownership checks on every
  message endpoint, cursor pagination and filters, logical delete, report
  creation (anonymous + authenticated), invalid reason, duplicate reports,
  admin-only review + audit logging, password reset (generic response,
  invalid/expired/reused tokens, session invalidation), rate limiting,
  NoSQL injection, payload limits, response hygiene, and **Google OAuth**
  (flow start, PKCE integrity, callback success, CSRF/state mismatch, expired
  flow, tampered cookie, replayed callback and replayed code, consent denial,
  ID-token/nonce/issuer failures, account-conflict and email-takeover
  guards, link/unlink/lockout prevention, redirect-mode handoff single-use).

  `tests/oauth.test.js` drives the whole feature through an injected fake
  OIDC client — **Google is never contacted** and no test needs real
  credentials.

---

## 13. Deployment notes

- Set `NODE_ENV=production` and provide every required variable; the app
  refuses to start in production with missing configuration.
- Put the app behind TLS and a reverse proxy (`trust proxy` is set to `1`).
- Use a **managed MongoDB** with authentication and encryption at rest.
- Use a **shared rate-limit store** if you run more than one instance.
- Restrict `CLIENT_ORIGIN` to your real front-end origins. CORS is sent with
  `Access-Control-Allow-Credentials: true` so a cross-origin SPA can receive
  the OAuth flow cookie — the origin allow-list is therefore the only thing
  standing between you and a cookie leak, keep it tight.
- Use strong, unique values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
  and `FINGERPRINT_SALT` (e.g. `openssl rand -hex 32`).
- If Google sign-in is enabled: set `OAUTH_COOKIE_SECRET`
  (`openssl rand -hex 32`), register the **exact** callback URL as an
  Authorised redirect URI, and set `OAUTH_REDIRECT_URL` to your SPA so tokens
  are handed over with a one-time code instead of appearing in a URL.
- Run the admin script once, then unset the admin env values.
- Back up MongoDB and test restores; keep the audit-log retention aligned
  with your legal requirements.

---

## 14. Known limitations / not implemented

- **Google account linking/unlinking — unverified with real credentials**: a
  Google **sign-in** has now completed end-to-end (see §10.5), but linking an
  existing password account to Google and unlinking it again have only been
  exercised by the fake-client tests and by the UI wiring.
- **No email verification flow**: accounts are usable immediately. The
  `isVerified` field exists and Google sign-ins set it from Google's
  `email_verified` claim, but local signups never send a verification mail.
- **Scheduled purge job is missing**: expired refresh tokens, consumed reset
  tokens, consumed handoff codes and soft-deleted accounts past their 30-day
  window are removed lazily by the queries that touch them, not by a cron.
- **Session-only confirmation for Google-only accounts**: `PATCH /users/me/password`
  and `DELETE /users/me` accept a body with **no** `currentPassword`/`password`
  when the account has no local password hash. They used to require one
  unconditionally, and `bcrypt.compare(x, undefined)` can never succeed — so a
  Google-only user could neither set a first password nor delete their own
  account. Such callers are now trusted on the strength of their 15-minute
  access token alone; every account that *does* have a password must still
  present it, so a password account can never skip the check (an **empty**
  `currentPassword` is still rejected by the validator, not treated as absent).
  Two knock-on rules follow the stored hash instead of `authProvider`:
  Google unlinking becomes permitted once `hasPassword` flips to true.
- **Password recovery is switched off**: `POST /password/forgot` answers
  `503 PASSWORD_RESET_DISABLED` because there is no channel left to deliver a
  link (§11) — email was removed outright rather than left half-configured.
  A **local** account that loses its password therefore has no self-service
  way back in; the only ways back are signing in with a linked Google account
  and setting a new password from Settings, or an operator resetting it
  out-of-band. Reintroducing any delivery channel (email, SMS, WhatsApp)
  means implementing `requestPasswordReset` again and flipping the controller
  back — `POST /password/reset` and the `PasswordResetToken` model are intact
  and tested, so only the issuing half has to return.
- **Shared rate-limit store**: the interface is ready
  (`createLimiter({ store })`) but no Redis store is bundled.
- **Refresh-token cookie mode**: tokens are returned in the response body
  (Bearer flow). If you switch to cookies, add `HttpOnly`/`Secure`/`SameSite`
  and CSRF protection.
- **Client-side token storage**: `client/` keeps both tokens in
  `localStorage` because the API hands the refresh token back in the response
  body and never sets a cookie. That is readable by any injected script; the
  usual trade-off of "persist the session" vs "survive XSS". Moving the
  refresh token into an `HttpOnly` cookie would remove this.
- **`avatar`** accepts an image URL, a `data:` URI (built-in presets), or an uploaded file via `PATCH /api/v1/users/me/avatar` (`multipart/form-data`, PNG/JPEG/GIF/WebP, max 2 MB). Uploaded files are verified by magic bytes and stored under `/uploads/avatars/`; the old file is reclaimed when replaced. A dead link degrades to initials in the UI.

---

## 15. License

ISC
