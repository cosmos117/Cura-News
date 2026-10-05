# CURA News Frontend

A modern React + Vite frontend for the CURA News AI-powered news summarization platform.

## 🎯 Features

- ✅ **React 18** with Vite for fast development
- ✅ **Plain CSS design system** for responsive design (no CSS framework)
- ✅ **React Router v6** for client-side routing
- ✅ **Axios** with interceptors for API communication
- ✅ **Authentication Context** for state management
- ✅ **Responsive Design** mobile-first approach
- ✅ **Lucide Icons** for beautiful UI icons

## 📁 Project Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.jsx         # User login page
│   │   ├── Signup.jsx        # User registration page
│   │   ├── Dashboard.jsx     # News articles list & search
│   │   └── Article.jsx       # Article details with summary, quiz, notes
│   ├── components/           # Reusable components (can be expanded)
│   ├── context/
│   │   └── AuthContext.jsx   # Authentication state management
│   ├── services/
│   │   ├── apiClient.js      # Axios instance with interceptors
│   │   └── api.js            # API endpoint functions
│   ├── App.jsx               # Main app with routing
│   ├── main.jsx              # React entry point
│   └── index.css             # Design tokens + all component styles
├── index.html                # HTML template
├── vite.config.js            # Vite configuration
├── package.json              # Dependencies & scripts
├── .env.example              # Environment variables template
└── .gitignore                # Git ignore rules
```

## 🚀 Getting Started

### Prerequisites

- Node.js v16+ and npm/yarn

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your API base URL
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

The app will open at `http://localhost:3000`

### Build for production

```bash
npm run build
npm run preview
```

## 🔑 Key Files & Their Purpose

### **Pages**

#### `Login.jsx`

- User login form
- Email & password validation
- Password visibility toggle
- Inline error message
- Redirect to dashboard on success

#### `Signup.jsx`

- User registration form
- Password confirmation validation
- Inline error message and redirect to dashboard
- Live min-length hint and mismatch warnings

#### `Dashboard.jsx`

- Article cards grouped by source, plus a flat grid view
- Client-side search across headline, summary, bullet points and tags
- Tag filter pills (server-side filtering via the `tags` query param)
- Empty and error states

#### `Article.jsx`

- Article header with source, date and tags
- Tabbed interface (tabs appear only when the data exists):
  - **Article**: subtopics and bullet points
  - **AI Summary**: AI-generated summary (if available)
  - **Quiz**: interactive quiz with per-question review (authenticated)
  - **Notes**: create/delete notes, and see other students' notes

### **Context**

#### `AuthContext.jsx`

- Manages user authentication state
- Provides `useAuth()` hook
- Methods: `login()`, `register()`, `logout()`
- Automatic token storage in localStorage
- 401 error handling with auto-redirect to login

### **Services**

#### `apiClient.js`

- Axios instance with base URL
- Request interceptor: Adds auth token to headers
- Response interceptor: Handles 401 errors
- Automatically reads `VITE_API_BASE_URL` from .env

#### `api.js`

- Organized API endpoint functions
- Modules:
  - `authAPI`: register, login, logout, getCurrentUser
  - `newsAPI`: CRUD operations for articles
  - `aiAPI`: Summarization endpoints
  - `notesAPI`: Note management
  - `quizAPI`: Quiz submission & retrieval

## 🎨 Styling

There is **no CSS framework**. `src/index.css` is the single stylesheet and is
organised as a design system:

- **Custom properties** — colour, spacing, radius, shadow and type-scale tokens
  defined once on `:root`, plus responsive overrides in the media queries
- **Semantic class names** — `.card`, `.btn`, `.input`, `.alert`, `.badge`,
  `.pill`, `.tab`, `.quiz-question`, `.note`, `.article-card`, `.site-header`,
  `.auth-card`. Components reference these, never raw layout utilities
- **BEM-style modifiers** — `--active`, `--error`, `--danger`, `--correct`
  for state variants (`.tab--active`, `.input--error`)
- **Responsive** — mobile-first; layout, header and segmented-control label
  rules collapse under `@media (max-width: 768px)`
- **Reduced motion** — animations are disabled under
  `@media (prefers-reduced-motion: reduce)`

To restyle, edit the token block at the top of `index.css`; to add a component
style, add a block in the matching numbered section.

## 🔐 Authentication Flow

1. User visits `/login` or `/signup`
2. After successful login/registration:
   - JWT token stored in localStorage
   - User data stored in Auth context
   - Redirect to `/dashboard`
3. Protected routes check `isAuthenticated` status
4. On 401 error: Auto-logout and redirect to login

## 🌐 API Integration

### Base URL

```javascript
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
```

### Request/Response Example

```javascript
// Request with auth token
GET /news?tags=Polity&limit=50&skip=0
Header: Authorization: Bearer <token>

// Response
{
  success: true,
  count: 2,
  data: [
    {
      _id: "...",
      source: "The Hindu",
      date: "2024-03-17",
      headline: "Article headline",
      summary: "AI-written summary",
      bulletPoints: ["point one", "point two"],
      tags: ["Polity"],
      subtopics: ["Parliament"],
      quiz: [],
      url: "https://...",
    },
  ],
}
```

## 📦 Dependencies

### Core

- `react@18.2.0` - UI library
- `react-dom@18.2.0` - React DOM rendering
- `react-router-dom@6.20.0` - Client-side routing
- `axios@1.6.5` - HTTP client
- `lucide-react@0.294.0` - Icon library

### Styling

None. Styling ships as plain CSS in `src/index.css`.

### Build Tools

- `vite@5.0.8` - Fast build tool
- `@vitejs/plugin-react@4.2.1` - React plugin

## 🎯 Next Steps / Enhancements

1. **Features to Add**
   - Server-side full-text search (the `GET /news/search` endpoint is unused;
     the dashboard searches the loaded page in memory)
   - User profile page
   - Favorites/bookmarks
   - Note editing (create and delete are implemented)

2. **Optimization**
   - Lazy load page components
   - Caching strategies
   - Code splitting

3. **Testing**
   - Add Vitest for unit tests
   - Add React Testing Library
   - E2E testing with Cypress

4. **Deployment**
   - Configure CI/CD pipeline
   - Deploy to Vercel, Netlify, or GitHub Pages
   - Configure environment variables for production

## 🛠️ Development Commands

```bash
# Start dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

There are no `format` or `lint` scripts yet.

## 📱 Responsive Breakpoints

- **Mobile**: < 640px (1 column)
- **Tablet**: 640px - 1024px (2 columns)
- **Desktop**: > 1024px (3 columns)

## 🔗 API Endpoints Used

| Method | Endpoint            | Purpose              |
| ------ | ------------------- | -------------------- |
| POST   | `/auth/register`    | User registration    |
| POST   | `/auth/login`       | User login           |
| POST   | `/auth/logout`      | User logout          |
| GET    | `/auth/me`          | Current user profile |
| GET    | `/news`             | List articles (`tags`, `limit`, `skip`) |
| GET    | `/news/:id`         | Get article details  |
| GET    | `/notes/article/:id` | Notes for one article |
| POST   | `/notes`            | Create note          |
| DELETE | `/notes/:id`        | Delete own note      |
| GET    | `/quiz/:articleId`  | Get quiz (no answers)|
| POST   | `/quiz/submit`      | Submit quiz answers  |

See the root `README.md` for the full endpoint table and data models.

## 💡 Tips & Best Practices

1. **Always use the `useAuth()` hook** for authentication checks
2. **Use API functions from `api.js`** instead of direct axios calls
3. **Handle errors gracefully** with user-friendly messages
4. **Test on mobile devices** - use Chrome DevTools device emulation
5. **Keep components small** and focused on single responsibility

## 📝 License

Part of CURA News project

---

**Frontend Status**: ✅ **COMPLETE** - Ready for development and testing
