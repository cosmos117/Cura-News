import { Link } from "react-router-dom";
import {
  Newspaper,
  Sparkles,
  BookOpen,
  SlidersHorizontal,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Check,
  Rss,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { NEWS_SOURCES, NEWS_TAGS } from "../constants/news";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI summaries that respect the source",
    text: "Short rule-based briefs instantly, plus Gemini-powered detailed summaries validated sentence-by-sentence. Thin or paywalled pages are marked unavailable, never invented.",
  },
  {
    icon: BookOpen,
    title: "Catch up in minutes",
    text: "Every story ships with a short brief and key points, so you can scan the day's headlines from multiple sources without opening ten tabs.",
  },
  {
    icon: SlidersHorizontal,
    title: "Filter by what matters to you",
    text: "Fifteen broad categories and five topic tags — Polity, Economy, Defense, Science, International — with search, source, and category filters that combine.",
  },
  {
    icon: RefreshCw,
    title: "Fresh every 15 minutes",
    text: "A background scheduler ingests RSS around the clock and the dashboard re-polls every minute, so the day's headlines assemble themselves.",
  },
  {
    icon: ExternalLink,
    title: "Always traceable to the original",
    text: "Each card links to the publisher page. Source text is extracted in memory for summarisation and discarded, never stored.",
  },
];

const STEPS = [
  {
    icon: Rss,
    step: "Step 1",
    title: "We aggregate trusted RSS",
    text: "The Hindu, Indian Express and Times of India feeds are fetched, deduplicated and filed under a stable feed registry.",
  },
  {
    icon: Sparkles,
    step: "Step 2",
    title: "AI distils the story",
    text: "Deterministic rules write the instant brief; Gemini (Groq fallback) writes the detailed explainer with topic tags and category.",
  },
  {
    icon: Rss,
    step: "Step 3",
    title: "You read, not doomscroll",
    text: "Read the brief and open the full story at the source when it matters.",
  },
];

const STATS = [
  { value: "3", label: "Trusted publishers" },
  { value: "15", label: "News categories" },
  { value: "5", label: "Topic tags" },
  { value: "15 min", label: "Ingest refresh" },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const primaryTo = isAuthenticated ? "/dashboard" : "/signup";
  const primaryLabel = isAuthenticated ? "Open your dashboard" : "Start reading free";

  return (
    <div className="page landing">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label="CURA News home">
            <span className="brand__mark">
              <img src="/logo.svg" alt="" width="40" height="40" />
            </span>
            <span>
              <span className="brand__name">CURA News</span>
              <br />
              <span className="brand__date">Daily news, summarized from multiple sources</span>
            </span>
          </Link>
          <nav className="landing-nav" aria-label="Page sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#sources">Sources</a>
          </nav>
          <div className="row row-3">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-sm">
                Dashboard
                <ArrowRight className="icon icon--sm" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-secondary btn-sm">Sign in</Link>
                <Link to="/signup" className="btn btn-primary btn-sm">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="container landing-hero__inner">
          <div className="landing-hero__copy">
            <p className="landing-badge">
              <Sparkles className="icon icon--sm" />
              AI summaries of the day's headlines, from sources you trust
            </p>
            <h1 className="landing-title">
              Cut the noise. <span className="landing-title__accent">Keep the news that matters.</span>
            </h1>
            <p className="landing-sub">
              CURA News aggregates The Hindu, Indian Express and Times of India
              — clear AI summaries of every story, so an hour of headlines
              becomes a 5-minute catch up.
            </p>
            <div className="landing-cta-row">
              <Link to={primaryTo} className="btn btn-primary btn-lg">
                {primaryLabel}
                <ArrowRight className="icon icon--lg" />
              </Link>
              {!isAuthenticated && (
                <Link to="/login" className="btn btn-secondary btn-lg">I have an account</Link>
              )}
            </div>
            <ul className="landing-meta">
              <li><Check className="icon icon--sm" /> Free to start</li>
              <li><Check className="icon icon--sm" /> No credit card</li>
              <li><Check className="icon icon--sm" /> Original links included</li>
            </ul>
          </div>
          <div className="landing-visual" aria-hidden="true">
            <div className="mock">
              <div className="mock__row">
                <span className="mock__pill">Polity</span>
                <span className="mock__time">The Hindu - 2h ago</span>
              </div>
              <p className="mock__headline">Parliament clears bill to digitise land records nationwide</p>
              <div className="mock__bars">
                <span style={{ width: "96%" }} />
                <span style={{ width: "88%" }} />
                <span style={{ width: "64%" }} />
              </div>
              <div className="mock__row">
                <span className="mock__pill mock__pill--soft">Economy</span>
                <span className="mock__pill mock__pill--soft">World</span>
                <span className="mock__link">Read original</span>
              </div>
            </div>
            <div className="mock-float mock-float--brief">
              <BookOpen className="icon icon--lg" />
            </div>
            <div className="mock-float mock-float--ai">
              <Sparkles className="icon icon--lg" />
              <div>
                <p className="mock-float__title">AI detailed summary</p>
                <p className="mock-float__sub">Validated - source-checked</p>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <dl className="landing-stats">
            {STATS.map((s) => (
              <div key={s.label} className="landing-stats__item">
                <dt className="landing-stats__value">{s.value}</dt>
                <dd className="landing-stats__label">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="container">
          <p className="landing-kicker">Why readers use CURA</p>
          <h2 className="landing-heading">Headlines to understanding in minutes</h2>
          <p className="landing-lead">Aggregation and summarisation live in one place — quoted from the source, not the algorithm.</p>
          <div className="landing-grid-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="card card--pad landing-feature">
                <span className="landing-feature__icon"><f.icon className="icon icon--xl" /></span>
                <h3 className="landing-feature__title">{f.title}</h3>
                <p className="landing-feature__text">{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="landing-section landing-section--tinted">
        <div className="container">
          <p className="landing-kicker">How it works</p>
          <h2 className="landing-heading">From RSS feed to brief in three steps</h2>
          <div className="landing-grid-3">
            {STEPS.map((s) => (
              <article key={s.title} className="card card--pad landing-step">
                <span className="landing-feature__icon"><s.icon className="icon icon--xl" /></span>
                <p className="landing-step__kicker">{s.step}</p>
                <h3 className="landing-feature__title">{s.title}</h3>
                <p className="landing-feature__text">{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="sources" className="landing-section">
        <div className="container">
          <p className="landing-kicker">Sources</p>
          <h2 className="landing-heading">Three newsrooms you already trust</h2>
          <p className="landing-lead">Section-level RSS feeds with per-feed category hints and topic mapping. Every story links back to its publisher.</p>
          <div className="landing-grid-3">
            {NEWS_SOURCES.map((source) => (
              <article key={source} className="card card--pad landing-source">
                <span className="landing-feature__icon"><Newspaper className="icon icon--xl" /></span>
                <h3 className="landing-feature__title">{source}</h3>
                <p className="landing-feature__text">National, business and world desks — deduplicated and refreshed through the day.</p>
              </article>
            ))}
          </div>
          <div className="landing-tags" aria-label="Topic tags">
            {NEWS_TAGS.map((tag) => (<span key={tag} className="landing-tag">{tag}</span>))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <div className="landing-cta-band">
            <h2 className="landing-cta-band__title">Today&apos;s headlines, summarized in minutes.</h2>
            <p className="landing-cta-band__sub">Join CURA News, read the first AI brief in under a minute, and keep up with every source in one place.</p>
            <div className="row row-3 row--center">
              <Link to={primaryTo} className="btn-cta-light">{primaryLabel}<ArrowRight className="icon icon--lg" /></Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="container landing-footer__inner">
          <div className="brand">
            <span className="brand__mark"><img src="/logo.svg" alt="" width="40" height="40" /></span>
            <span className="brand__name">CURA News</span>
          </div>
          <p>AI-powered news summaries from multiple trusted sources — with briefs and key points.</p>
          
          <p className="landing-footer__copy">© {new Date().getFullYear()} CURA News. Summaries may contain inaccuracies.</p>
        </div>
      </footer>
    </div>
  );
}
