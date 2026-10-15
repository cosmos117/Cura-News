<p align="center">
  <img src="frontend/public/logo-lockup.svg" alt="CURA News" width="360" />
</p>

# CURA News

AI-powered daily news: aggregated stories from multiple sources with clear
AI-written summaries and key points.

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Node.js, Express 4 (ESM), Mongoose 7, MongoDB |
| AI | Rule-based short summaries; Gemini primary and Groq fallback for detailed summaries |
| Ingestion | Configurable RSS feeds from The Hindu, Indian Express, and Times of India |
| Frontend | React 18, Vite 5, React Router 6, plain CSS design system, Axios |

## Project layout

```
backend/
  src/
    config/       env + database + dotenv bootstrap
    controllers/  auth, news, ai
    middleware/   auth, cors, errorHandler, rateLimiter
    models/       User, News
    routes/       auth, news, ai, test
    services/     aiService, rssFetcher, newsProcessor, topicClassifier,
                  detailedSummaryService, articleTextExtractor, jwtService
    utils/        category, date (UTC day boundaries)
  scripts/
    verify.mjs    end-to-end test suite (in-memory MongoDB)
frontend/
  src/
    components/   ErrorBoundary
    constants/    news tag + source enums
    context/      AuthContext
    pages/        Login, Signup, Dashboard, Article, NotFound
    services/     apiClient (axios), api (endpoint wrappers)
    utils/        format (dates, error messages)
```

## Getting started

### Prerequisites

- Node.js 16+
- MongoDB (local or Atlas)
- Gemini API key for detailed summaries (Groq can be configured as fallback)
- RSS feeds (configured by default; URLs can be overridden in `.env`)

### Backend

```bash
cd backend
npm install
cp .env.example .env     # then fill in the keys
npm run dev              # http://localhost:5000
npm test                 # end-to-end suite, no MongoDB install required
```

The server refuses to start in production with a placeholder `JWT_SECRET`,
because a publicly known signing key would let anyone forge a token.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env     # VITE_API_BASE_URL=http://localhost:5000/api
npm run dev              # http://localhost:3000
```

## Environment variables

### RSS feed registry

Section-level feeds are maintained in
[`backend/src/config/feeds.js`](backend/src/config/feeds.js). Each enabled
feed has a stable feed ID, section, default category, topic hints, and
priority. Check feed health before enabling a new source:

```bash
cd backend
npm run feeds:check
```

The report includes item count, newest item date, average description length,
and whether full content is present.

Backend (see `backend/.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGO_URI` | yes | Falls back to `mongodb://localhost:27017/cura-news` |
| `JWT_SECRET` | in production | ≥32 chars, must not be the example value |
| `JWT_EXPIRE` | no | Default `7d` |
| `GEMINI_API_KEY` | for detailed summaries | Primary AI provider |
| `GEMINI_MODEL` | no | Default `gemini-3.8-flash` |
| `GROQ_API_KEY` | optional | Fallback detailed-summary provider |
| `GROQ_MODEL` | no | Default `openai/gpt-oss-120b` |
| `AI_PROVIDER` | no | `gemini` (default) or `groq` |
| `CORS_ORIGIN` | in production | Comma-separated list |
| `RATE_LIMIT_AI` | no | `false` disables the AI limiter (local dev only) |
| `DETAILED_TOP_N` | no | Number of recent articles considered for ingestion-time detailed summaries; default `30` |
| `MIN_TEXT_CHARS` | no | Minimum extracted source text required for a detailed summary; default `800` |
| `INPUT_MAX_CHARS` | no | Maximum in-memory source text sent to the AI provider; default `12000` |
| `AI_DAILY_LIMIT` | no | Maximum detailed summaries generated per UTC day; default `100` |
| `AI_DELAY_MS` | no | Delay between ingestion-time detailed-summary attempts; default `500` |
| `INGEST_INTERVAL_MINUTES` | no | How often the background pipeline fetches new articles; default `15` |
| `FETCH_TIMEOUT_MS` | no | Timeout for robots.txt and source-page fetches; default `10000` |

Frontend:

| Variable | Default |
| --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:5000/api` |

## API

All routes are under `/api`. Routes marked **auth** require
`Authorization: Bearer <token>`.

### Auth
| Method | Path | |
| --- | --- | --- |
| POST | `/auth/register` | Returns a token; body `{name, email, password, confirmPassword}` |
| POST | `/auth/login` | Returns a token |
| GET | `/auth/me` | **auth** |
| POST | `/auth/logout` | **auth** — client-side token discard only |

### News
| Method | Path | |
| --- | --- | --- |
| GET | `/news` · `/news/today` | Query: `search` (min 3 chars), `tag`, `tags`, `category`, `source`, `limit`, `skip`. All filters AND together |
| GET | `/news/search?q=` | Full-text over headlines + summaries |
| GET | `/news/tag/:tagName` | |
| GET | `/news/source/:sourceName` | |
| GET | `/news/stats/overview` | Aggregates by source, tag and category |
| GET | `/news/:id` | Article detail |
| POST | `/news/:id/detailed` | **auth**, rate limited. Returns the cached detailed summary or generates it once |
| POST | `/news` | **auth** — `category` optional, defaults to `Other` |
| GET | `/news/fetch-daily` | **auth**, rate limited. Returns 202; runs the pipeline in the background |

Single-segment paths are registered before `/:id` deliberately — reversing that
order silently shadows `/search` and `/fetch-daily`.

### AI
| Method | Path | |
| --- | --- | --- |
| POST | `/ai/summarize` | **auth**, rate limited. Body `{articleText}` |
| POST | `/ai/batch-summarize` | **auth**, rate limited. Body `{articles: string[]}`, max 10 |
| POST | `/ai/quick-analyze` | **auth**, rate limited |
| GET | `/ai/health` | Config check only — does not call OpenAI |

## Data models

```js
// User
{ _id, name, email (unique), password (hashed, select:false),
  isActive, createdAt, updatedAt }

// News
{ _id, source: "The Hindu"|"Indian Express"|"Times of India",
  date, headline, summary, bulletPoints[3..10],
  detailedSummary, detailedStatus: "NONE"|"PENDING"|"DONE"|"FAILED"|"UNAVAILABLE",
  detailedGeneratedAt, detailedConfidence: "high"|"medium"|"low",
  detailSourceType: "FULL_TEXT"|"SNIPPET_ONLY",
  category: "Politics"|"Business"|"Sports"|"Tech"|"World"|"Entertainment"|"Other",
  tags[1..3]: "Polity"|"Economy"|"Defense"|"Science"|"International",
  subtopics[<=5],
  url, isPublished, createdAt, updatedAt }
```

### Topics and filtering

`backend/src/config/topics.js` is the single source of truth for the 12 topic
IDs, labels, definitions, and keyword rules. Each article receives exactly one
primary `topic`, optional `secondaryTopics`, and `topicSource`/`topicConfidence`.
Classification uses section hints, word-boundary keyword scoring, and AI only
for ambiguous articles.

`GET /news` accepts `search`, `topic`, and `source`, and applies them all as an
AND in a single query. Legacy `category` and `tag`/`tags` parameters remain
backward-compatible for existing clients. The response returns topic and
source facets computed over the same filter minus
the category constraint, which is what keeps the dashboard's topic cards
populated and clickable while a category is selected. Unknown `category`,
`source` or `tags` values are rejected with a 400 rather than silently ignored,
because a silently ignored typo is indistinguishable from an empty result.

Note: RSS ingestion applies no sports/entertainment exclusion. The exclusion
list that used to live in the NewsAPI fetcher was dropped along with that
fetcher, so `Sports` and `Entertainment` are now populated by ingestion like
any other topic, and mostly by the `Latest`/`Top Stories` feeds.

## Ingestion pipeline

### Automatic scheduling

`GET /api/news/today` only returns articles published inside the **current UTC
day**. Nothing fetched yesterday appears, so a process that never refetches
leaves the dashboard reading "0 articles" from midnight onward even though the
feeds are full.

The server therefore runs the pipeline itself on a timer
(`services/scheduler.js`), every `INGEST_INTERVAL_MINUTES` (default 15) plus once
shortly after boot. It reuses the pipeline's own in-flight lock, so a run that
outlives its interval skips the next tick rather than overlapping, and a failed
run is logged without taking the interval down. It is disabled under
`NODE_ENV=test`, and stopped before the database is closed on shutdown.

Two consequences worth knowing:

- The scheduler lives **in the server process**, so every running instance
  ingests. Deduplication and the in-flight lock are per-process, not shared;
  running more than one instance multiplies the work (wastefully, but safely).
- It only backfills what the feeds still carry. After downtime longer than a
  feed's retention, older articles cannot be recovered.

The dashboard also re-polls `/news` every 60 seconds (paused while the tab is
hidden) so newly ingested articles appear without a manual reload.

### Steps

`GET /api/news/fetch-daily` runs the same pipeline on demand:

1. **Fetch** — configurable RSS feeds from the three supported sources
2. **Deduplicate** — drop URLs already in the database
3. **Summarize** — deterministic rules create a short summary, bullet points,
   category, and topic tags
4. **Store** — insert into MongoDB

RSS ingestion does not require a NewsAPI key. It reads only feed metadata and
must continue to respect each publisher's feed terms, robots rules, and rate
limits. The detailed-summary path separately fetches the linked article page
when permitted.

For detailed summaries, Gemini is attempted first. If it is unavailable or
returns an error, Groq is attempted as the fallback. API keys are read only
from `backend/.env`; they are never sent to the frontend.

Detailed summaries are a separate Tier 2 path. At ingestion, the top
`DETAILED_TOP_N` recent articles are considered after short-summary storage.
When a user opens an article's Summary tab, `POST /news/:id/detailed` lazily
generates the missing detail. The database status lock prevents concurrent
requests from generating the same article twice. The source page is checked
against `robots.txt`, extracted in memory, truncated, sent to the AI provider,
and discarded; extracted source text is never stored.

Detailed output is validated for heading length, sentence count, word count,
enums, and source-text overlap. Invalid JSON or validation failures receive one
repair attempt before being marked `FAILED`. Paywalled, disallowed, failed, or
too-short source pages are marked `UNAVAILABLE` without invented content.

Guard rails: the endpoint is authenticated and rate limited, the processor holds
an in-flight lock so runs cannot overlap, and upstream failures (bad key,
expired plan, rate limit) are reported instead of being flattened into "zero
articles found".

## Testing

```bash
cd backend && npm test
```

45 assertions against the real Express app on an in-memory MongoDB: auth,
removed-feature 404s, route shadowing, rate limiting, pagination, and UTC day
boundaries.

## Known limitations

- Tokens cannot be revoked server-side; `POST /auth/logout` only tells the
  client to discard its copy. A `tokenVersion` claim on `User` would allow real
  revocation.
- `isPublished` has no moderation path, so nothing is ever unpublished.
- NewsAPI's free tier returns at most 24 hours of history.
- Tokens are stored in `localStorage`, which is readable by any script in the
  origin. An httpOnly cookie would be stronger.
- There is no role model; every authenticated user has equal privileges.