<p align="center">
  <img src="frontend/public/logo-lockup.svg" alt="CURA News" width="360" />
</p>

# CURA News

AI-powered daily news: stories from The Hindu, Indian Express and Times of India,
each with an AI-written brief, key facts and an on-demand detailed explainer.

**Features:** a For You feed of the reader's own papers and topics, saved
articles (kept 24 hours), listen-aloud for detailed summaries, email or Google
sign-in, and self-service account deletion.

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Node.js, Express 4 (ESM), Mongoose 7, MongoDB |
| AI | Gemini and Groq, picked per call with pacing and per-provider cooldowns; rule-based fallback summaries |
| Ingestion | Section-level RSS feeds from the three papers |
| Frontend | React 18, Vite 5, React Router 6, plain CSS, Axios |

## Project layout

```
backend/
  src/
    config/       env, database, dotenv bootstrap, feeds, topics
    controllers/  auth, news, bookmarks, me (preferences, account)
    middleware/   auth, cors, errorHandler, rateLimiter
    models/       User, News, Bookmark
    routes/       auth, news, bookmarks, me, admin
    services/     aiService (provider scheduling), rssFetcher, newsProcessor,
                  scheduler, topicClassifier, detailedSummaryService,
                  articleTextExtractor, jwtService, content/ (prompts, schema)
    utils/        category, date (IST day keys), formatDetailedText
  scripts/
    verify.mjs        end-to-end test suite (in-memory MongoDB)
    check-feeds.mjs   feed health report
    topics-report.mjs article count per topic
frontend/
  src/
    components/   ErrorBoundary, GoogleSignInButton, ListenButton, SourceLogo
    constants/    topics, sources, topic icons
    context/      AuthContext
    hooks/        useSpeech (browser text-to-speech)
    pages/        Landing, Login, Signup, Onboarding, Dashboard, Article,
                  Bookmarks, Settings, NotFound
    services/     apiClient (axios), api (endpoint wrappers)
    utils/        format, feedMode
```

## Getting started

Prerequisites: Node.js 18+, MongoDB (local or Atlas), and a Gemini and/or Groq
API key.

```bash
cd backend
npm install
cp .env.example .env     # then fill in the keys
npm run dev              # http://localhost:5000
npm test                 # end-to-end suite, no MongoDB install required
```

```bash
cd frontend
npm install
cp .env.example .env
npm run dev              # http://localhost:3000
```

The server refuses to start in production with a placeholder `JWT_SECRET`.

## Environment variables

Backend (`backend/.env`; defaults live in `backend/src/config/env.js`):

| Variable | Notes |
| --- | --- |
| `MONGO_URI` | Default `mongodb://localhost:27017/cura-news` |
| `JWT_SECRET`, `JWT_EXPIRE` | Secret must be ≥32 chars in production; expiry default `7d` |
| `GOOGLE_CLIENT_ID` | OAuth web client ID; empty disables Google sign-in |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Default model `gemini-3.8-flash` |
| `GROQ_API_KEY`, `GROQ_MODEL` | Default model `openai/gpt-oss-120b` |
| `AI_PROVIDER` | Preferred provider: `gemini` (default) or `groq` |
| `GEMINI_RPM`, `GROQ_RPM` | Requests per minute each provider allows; defaults `10` and `30` (free tiers) |
| `AI_INTERACTIVE_TOKEN_RESERVE`, `AI_INTERACTIVE_REQUEST_RESERVE` | Capacity background work leaves free for readers; defaults `4000` tokens/min and `50` requests/day |
| `AI_DAILY_LIMIT` | Cap on AI calls per ingest run and detailed summaries per day; default `100` |
| `DETAILED_TOP_N` | Articles given a detailed summary in the background each day; default `30` |
| `MIN_TEXT_CHARS`, `INPUT_MAX_CHARS` | Source text bounds for detailed summaries; defaults `800` and `12000` |
| `INGEST_INTERVAL_MINUTES` | Ingest interval; default `15` |
| `CRON_SECRET` | Required by `POST /api/admin/ingest` |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `RATE_LIMIT_AI` | `false` disables the detailed-summary rate limit (local dev only) |

Frontend (`frontend/.env`): `VITE_API_BASE_URL` (default
`http://localhost:5000/api`) and `VITE_GOOGLE_CLIENT_ID` (same value as the
backend's `GOOGLE_CLIENT_ID`; empty hides the Google button).

Feeds are listed in [`backend/src/config/feeds.js`](backend/src/config/feeds.js).
Check their health with `npm run feeds:check` before adding one.

## API

All routes are under `/api`. **auth** means `Authorization: Bearer <token>`.

| Method | Path | |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | Return a token |
| POST | `/auth/google` | Body `{accessToken}` from the Google sign-in popup; creates the account on first use |
| GET | `/auth/me` | **auth**; includes For You picks and sign-in methods |
| GET | `/news` · `/news/today` | Query: `search` (≥3 chars), `topic`/`category`, `source`, `tags`, `limit`, `skip`; filters AND together |
| GET | `/news/for-you` | **auth**; same query, bounded by the reader's picks; 409 until they pick |
| GET | `/news/search`, `/news/tag/:tag`, `/news/source/:name`, `/news/stats/overview` | |
| GET | `/news/:id` | Article detail |
| POST | `/news/:id/detailed` | **auth**, rate limited; cached or generated detailed summary; 429 with `retryAfterMs` when AI is busy |
| POST | `/news` | **auth** |
| GET, POST, DELETE | `/bookmarks`, `/bookmarks/:articleId`, `/bookmarks/:articleId/status` | **auth**; saved articles keep a copy and expire after 24 hours |
| GET, PUT | `/me/preferences` | **auth**; For You picks `{sources, topics}` |
| POST | `/me/onboarding/skip` | **auth** |
| DELETE | `/me` | **auth**; body `{confirm: "DELETE"}`; permanently deletes the account and its saved articles |
| POST | `/admin/ingest` | Header `x-cron-secret`; runs the pipeline in the background |

## Data models

```js
// User
{ name, email, password? (hashed), googleId?, avatar, isActive,
  preferences: { sources[], topics[], onboardedAt } }

// News
{ source, headline, summary, keyFacts[], tags[], category, topic,
  secondaryTopics[], url, publishedAt, publishedDayKey (IST),
  detailedSummary, detailedStatus: "NONE"|"PENDING"|"DONE"|"FAILED"|"UNAVAILABLE",
  promptVersion, modelUsed, isPublished }

// Bookmark
{ user, article, snapshot (copy of the article), expiresAt (TTL, 24h) }
```

[`backend/src/config/topics.js`](backend/src/config/topics.js) defines the 15
topics. Each article gets one primary topic from section hints and keyword
rules, with the AI classifying only the ambiguous ones.

## Ingestion pipeline

The scheduler (`services/scheduler.js`) runs the pipeline every
`INGEST_INTERVAL_MINUTES` between 05:00 and 23:59 IST, and deletes all articles
at 00:00 IST, so the feed always holds today's news. Saved articles survive the
reset through their stored copy.

Each run: fetch today's RSS items, drop URLs already stored, generate a brief
and key facts with the AI (rule-based fallback when the AI is unavailable),
classify topics, and store in batches. Detailed summaries are generated for the
top `DETAILED_TOP_N` articles in the background, and on demand when a reader
opens the Detailed tab. The source page is fetched in memory, summarised and
discarded; source text is never stored.

AI calls go through `aiService.generateStructured`, which paces requests per
provider, honours each provider's retry hints, falls over to the other
provider, and keeps capacity in reserve for readers so background work cannot
make their requests fail.

## Deployment

The frontend is a static site (Vercel); the backend is one always-on Node
service (Render) with a hosted MongoDB (Atlas).

1. **Database:** create an Atlas cluster and a database user. Under Network
   Access allow Render's outbound traffic (`0.0.0.0/0` is the simple option).
2. **Backend on Render:** New → Blueprint, pick this repo; [`render.yaml`](render.yaml)
   creates the service. `JWT_SECRET` and `CRON_SECRET` are generated for you.
   Fill in the variables marked as secret: `MONGO_URI`, `CORS_ORIGIN` (your
   Vercel URL, no trailing slash), `GEMINI_API_KEY`, `GROQ_API_KEY`, and
   `GOOGLE_CLIENT_ID` if you use Google sign-in.
3. **Frontend on Vercel:** import the repo, set the Root Directory to
   `frontend`, and add `VITE_API_BASE_URL` (`https://<your-render-service>.onrender.com/api`)
   and `VITE_GOOGLE_CLIENT_ID`. [`frontend/vercel.json`](frontend/vercel.json) makes
   page refreshes on `/dashboard` and other routes work.
4. **Google sign-in:** add the Vercel URL under "Authorized JavaScript origins"
   for the OAuth client.

Keep the backend on a plan that never sleeps and run exactly one instance: the
ingest scheduler, the midnight reset, AI pacing and rate limits all live in the
process's memory. Check `https://<service>/health` after deploying.

## Testing

```bash
cd backend && npm test
```

78 checks against the real Express app on an in-memory MongoDB, with AI
providers stubbed: auth and Google sign-in, feeds and filters, For You,
bookmarks, account deletion, and AI rate-limit handling.

## Known limitations

- Tokens cannot be revoked server-side; logout discards the client copy.
- Tokens live in `localStorage`; an httpOnly cookie would be stronger.
- The scheduler runs in the server process, so every instance ingests.
- Free AI tiers are small (Gemini: 20 requests/day for the default model), so
  most AI work runs on Groq.
