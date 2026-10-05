# CURA News

AI-powered current affairs for UPSC/CDS preparation: aggregated news, AI-written
summaries, quizzes, and study notes.

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
    controllers/  auth, news, ai, notes, quiz
    middleware/   auth, cors, errorHandler, rateLimiter
    models/       User, News, Note
    routes/       auth, news, ai, notes, quiz, test
    services/     aiService, newsFetcher, newsProcessor, jwtService
    utils/        date (UTC day boundaries)
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
feed has a stable feed ID, section, default category, syllabus hints, and
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
| `GEMINI_MODEL` | no | Default `gemini-2.0-flash` |
| `GROQ_API_KEY` | optional | Fallback detailed-summary provider |
| `GROQ_MODEL` | no | Default `llama-3.3-70b-versatile` |
| `AI_PROVIDER` | no | `gemini` (default) or `groq` |
| `NEWS_API_KEY` | no | Retained for compatibility; RSS is now the ingestion source |
| `CORS_ORIGIN` | in production | Comma-separated list |
| `RATE_LIMIT_AI` | no | `false` disables the AI limiter (local dev only) |
| `DETAILED_TOP_N` | no | Number of recent articles considered for ingestion-time detailed summaries; default `30` |
| `MIN_TEXT_CHARS` | no | Minimum extracted source text required for a detailed summary; default `800` |
| `INPUT_MAX_CHARS` | no | Maximum in-memory source text sent to the AI provider; default `12000` |
| `AI_DAILY_LIMIT` | no | Maximum detailed summaries generated per UTC day; default `100` |
| `AI_DELAY_MS` | no | Delay between ingestion-time detailed-summary attempts; default `500` |
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
| GET | `/news/:id` | Quiz answers always stripped |
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

### Notes
| Method | Path | |
| --- | --- | --- |
| GET | `/notes` | **auth** — the caller's own notes |
| POST | `/notes` | **auth** |
| GET | `/notes/note/:id` | **auth**, owner only |
| PUT | `/notes/:id` | **auth**, owner only |
| DELETE | `/notes/:id` | **auth**, owner only |
| PATCH | `/notes/:id/pin` | **auth**, owner only |
| GET | `/notes/stats/overview` | **auth** |
| GET | `/notes/article/:articleId` | Public. Every user's notes for an article, author name only, paginated |

### Quiz
| Method | Path | |
| --- | --- | --- |
| GET | `/quiz/:articleId` | Questions without answers |
| POST | `/quiz/submit` | Body `{articleId, answers: ["A",...]}`. Returns score plus per-question `correctAnswer` / `isCorrect` |
| GET | `/quiz/stats/:articleId` | Question count only |
| POST | `/quiz/analysis/:articleId` | Structural analysis |

There is deliberately no endpoint that returns an answer key. `POST /quiz/submit`
returns per-question feedback after an attempt.

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
  quiz[3..5]: [{ question, options[4], answer: "A"|"B"|"C"|"D" }],
  url, isPublished, createdAt, updatedAt }

// Note
{ _id, userId -> User, articleId -> News, content[10..2000],
  tags[<=5], isPinned, createdAt, updatedAt }
```

`quiz` is optional; when unset it is stored as an empty array.

### Topics and filtering

`backend/src/config/topics.js` is the single source of truth for the 12 topic
IDs, labels, definitions, and keyword rules. Each article receives exactly one
primary `topic`, optional `secondaryTopics`, and `topicSource`/`topicConfidence`.
Classification uses section hints, word-boundary keyword scoring, and AI only
for ambiguous articles.

`GET /news` accepts `search`, `topic`, and `source`, and applies them all as an
AND in a single query. Legacy `category` and syllabus parameters remain
backward-compatible for existing clients. The response returns topic and
source facets computed over the same filter minus
the category constraint, which is what keeps the dashboard's topic cards
populated and clickable while a category is selected. Unknown `category`,
`source` or `tags` values are rejected with a 400 rather than silently ignored,
because a silently ignored typo is indistinguishable from an empty result.

Note: the ingestion pipeline excludes sports and entertainment keywords
(`newsFetcher.js`), so `Sports` and `Entertainment` can only be populated by
manually created articles until that curation rule changes.

## Ingestion pipeline

`GET /api/news/fetch-daily` runs five steps:

1. **Fetch** — configurable RSS feeds from the three supported sources
2. **Deduplicate** — drop URLs already in the database
3. **Filter** — RSS items are accepted without paid AI relevance calls
4. **Summarize** — deterministic rules create a short summary, bullet points,
   category, and syllabus tags
5. **Store** — insert into MongoDB

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

46 assertions against the real Express app on an in-memory MongoDB: auth and
ownership, the notes controller crashes, route shadowing, answer leakage, rate
limiting, pagination, and UTC day boundaries.

## Known limitations

- Quiz submissions are **not persisted**, so `GET /quiz/stats/:id` can only
  report question counts — no attempt history, averages, or pass rate.
- Tokens cannot be revoked server-side; `POST /auth/logout` only tells the
  client to discard its copy. A `tokenVersion` claim on `User` would allow real
  revocation.
- `isPublished` has no moderation path, so nothing is ever unpublished.
- NewsAPI's free tier returns at most 24 hours of history.
- Tokens are stored in `localStorage`, which is readable by any script in the
  origin. An httpOnly cookie would be stronger.
- There is no role model; every authenticated user has equal privileges.