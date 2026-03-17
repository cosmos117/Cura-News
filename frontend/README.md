# CURA News Frontend

A modern React + Vite frontend for the CURA News AI-powered news summarization platform.

## 🎯 Features

- ✅ **React 18** with Vite for fast development
- ✅ **Tailwind CSS** for responsive design
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
│   └── index.css             # Tailwind & global styles
├── index.html                # HTML template
├── vite.config.js            # Vite configuration
├── tailwind.config.js        # Tailwind CSS configuration
├── postcss.config.js         # PostCSS configuration
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
- Error handling with toast notifications
- Redirect to dashboard on success

#### `Signup.jsx`

- User registration form
- Password confirmation validation
- Success toast and redirect to login
- Form validation

#### `Dashboard.jsx`

- News articles grid layout
- Search articles by title/description
- Filter by category
- Click article to view details
- Responsive grid (1, 2, 3 columns)

#### `Article.jsx`

- Full article content display
- Tabbed interface:
  - **Full Article**: Complete content
  - **AI Summary**: AI-generated summary (if available)
  - **Quiz**: Interactive quiz (if available)
  - **My Notes**: User's saved notes

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

## 🎨 Tailwind CSS Setup

- **Configured for:** React/JSX files
- **Custom Colors:** primary (blue), secondary (gray), accent (amber)
- **Utilities:** Full Tailwind utility classes available
- **Responsive:** Mobile-first responsive design

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
GET / api / news;
Header: Authorization: Bearer <
  token >
  // Response
  {
    success: true,
    data: [
      {
        _id: "...",
        title: "Article title",
        description: "...",
        content: "...",
        category: "technology",
        imageUrl: "...",
        publishedAt: "2024-03-17T...",
      },
    ],
  };
```

## 📦 Dependencies

### Core

- `react@18.2.0` - UI library
- `react-dom@18.2.0` - React DOM rendering
- `react-router-dom@6.20.0` - Client-side routing

### Utilities

- `axios@1.6.5` - HTTP client
- `lucide-react@0.294.0` - Icon library

### Styling

- `tailwindcss@3.3.6` - Utility-first CSS
- `autoprefixer@10.4.16` - Vendor prefixes

### Build Tools

- `vite@5.0.8` - Fast build tool
- `@vitejs/plugin-react@4.2.1` - React plugin

## 🎯 Next Steps / Enhancements

1. **Add Components**
   - Navbar component
   - Footer component
   - Loading skeleton
   - Error boundary

2. **Features to Add**
   - Quiz submission functionality
   - Note creation/editing
   - User profile page
   - Favorites/bookmarks
   - Comment system

3. **Optimization**
   - Lazy load page components
   - Image optimization
   - Caching strategies
   - Code splitting

4. **Testing**
   - Add Vitest for unit tests
   - Add React Testing Library
   - E2E testing with Cypress

5. **Deployment**
   - Configure CI/CD pipeline
   - Deploy to Vercel, Netlify, or GitHub Pages
   - Configure environment variables for production

## 🛠️ Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Format code (add Prettier)
npm run format

# Lint code (add ESLint)
npm run lint
```

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
| GET    | `/news`             | Get all articles     |
| GET    | `/news/:id`         | Get article details  |
| GET    | `/news/:id/summary` | Get AI summary       |
| POST   | `/ai/summarize`     | Generate summary     |
| GET    | `/quiz/:articleId`  | Get quiz             |
| POST   | `/quiz/submit`      | Submit quiz answers  |
| GET    | `/notes`            | Get user notes       |
| POST   | `/notes`            | Create note          |

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
