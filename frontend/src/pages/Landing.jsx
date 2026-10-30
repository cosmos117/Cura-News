import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  BookOpen,
  SlidersHorizontal,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Check,
  Rss,
  Headphones,
  Bookmark,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { NEWS_SOURCES } from "../constants/news";
import { SOURCE_PROFILES } from "../constants/sources";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Summaries in the publisher's own words",
    text: "Every story opens with a short summary and key points taken straight from what the publisher reported. Want more? Open a detailed AI explainer written only from the full article. If a page is too thin or paywalled, we say so instead of guessing.",
  },
  {
    icon: SlidersHorizontal,
    title: "Filter by what matters to you",
    text: "Fifteen broad topics with search, source, and topic filters that combine.",
  },
  {
    icon: RefreshCw,
    title: "Fresh through the day",
    text: "New stories arrive every 15 minutes from 5am to midnight, and your dashboard updates on its own. Each morning starts with a clean slate.",
  },
  {
    icon: ExternalLink,
    title: "Always traceable to the original",
    text: "Every story links straight to the publisher's page, so the full report is one tap away.",
  },
  {
    icon: Bookmark,
    title: "Save stories for later",
    text: "Bookmark anything that catches your eye and come back to it any time in the next 24 hours, even after the day's feed resets.",
  },
  {
    icon: Headphones,
    title: "Listen instead of read",
    text: "Have the detailed summary read aloud, with each paragraph highlighted as it is spoken.",
  },
];

const STEPS = [
  {
    icon: Rss,
    step: "Step 1",
    title: "We gather the headlines",
    text: "Stories from The Hindu, Indian Express and Times of India are collected through the day, with duplicates removed.",
  },
  {
    icon: Sparkles,
    step: "Step 2",
    title: "We distil the story",
    text: "Each story gets a short summary and key points drawn from the publisher's own text, filed under one of fifteen topics.",
  },
  {
    icon: BookOpen,
    step: "Step 3",
    title: "You read, not doomscroll",
    text: "Skim the summaries, open a detailed AI explainer on what interests you, and read the full story at the source when it matters.",
  },
];

const STATS = [
  { value: "3", label: "Trusted publishers" },
  { value: "15", label: "News topics" },
  { value: "15 min", label: "Between updates" },
  { value: "24 h", label: "Saved stories kept" },
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
              The day's headlines, summarized from sources you trust
            </p>
            <h1 className="landing-title">
              Cut the noise. <span className="landing-title__accent">Keep the news that matters.</span>
            </h1>
            <p className="landing-sub">
              CURA News aggregates The Hindu, Indian Express and Times of India
              — a clear summary of every story, with a detailed AI explainer
              when you want more, so an hour of headlines becomes a 5-minute
              catch up.
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
              <li><Check className="icon icon--sm" /> Sign in with Google</li>
              <li><Check className="icon icon--sm" /> Original links included</li>
            </ul>
          </div>
          <div className="landing-visual" aria-hidden="true">
            <div className="mock">
              <div className="mock__row">
                <span className="mock__pill">Politics &amp; Governance</span>
                <span className="mock__time">The Hindu - 2h ago</span>
              </div>
              <p className="mock__headline">Parliament clears bill to digitise land records nationwide</p>
              <div className="mock__bars">
                <span style={{ width: "96%" }} />
                <span style={{ width: "88%" }} />
                <span style={{ width: "64%" }} />
              </div>
              <div className="mock__row">
                <span className="mock__pill mock__pill--soft">Law &amp; Judiciary</span>
                <span className="mock__link">Read original</span>
              </div>
            </div>
            <div className="mock-float mock-float--brief">
              <BookOpen className="icon icon--lg" />
            </div>
            <div className="mock-float mock-float--ai">
              <Sparkles className="icon icon--lg" />
              <div>
                <p className="mock-float__title">Detailed AI explainer</p>
                <p className="mock-float__sub">On demand - from the full article</p>
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
          <p className="landing-lead">Three newsrooms in one feed, explained in plain language and always linked back to the original.</p>
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
          <h2 className="landing-heading">From headline to summary in three steps</h2>
          <div className="landing-flow" aria-label="How it works steps">
            {STEPS.map((s, i) => (
              <Fragment key={s.title}>
                <article className="card card--pad landing-step">
                  <span className="landing-feature__icon"><s.icon className="icon icon--xl" /></span>
                  <p className="landing-step__kicker">{s.step}</p>
                  <h3 className="landing-feature__title">{s.title}</h3>
                  <p className="landing-feature__text">{s.text}</p>
                </article>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="landing-flow__arrow" aria-hidden="true" />
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section id="sources" className="landing-section">
        <div className="container">
          <p className="landing-kicker">Sources</p>
          <h2 className="landing-heading">Three newsrooms you already trust</h2>
          <p className="landing-lead">Politics, business, sport, science and more from each paper's own sections. Every story links back to its publisher.</p>
          <div className="landing-grid-3">
            {NEWS_SOURCES.map((source) => (
              <article key={source} className="card card--pad landing-feature landing-source">
                <div className="landing-source__logo">
                  <img src={SOURCE_PROFILES[source]?.logo} alt={`${source} logo`} loading="lazy" />
                </div>
                <h3 className="landing-feature__title">{source}</h3>
                <p className="landing-source__meta">{SOURCE_PROFILES[source]?.meta}</p>
                <p className="landing-feature__text">{SOURCE_PROFILES[source]?.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <div className="landing-cta-band">
            <h2 className="landing-cta-band__title">Today&apos;s headlines, summarized in minutes.</h2>
            <p className="landing-cta-band__sub">Join CURA News, read your first summary in under a minute, and keep up with every source in one place.</p>
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
          <p>News summaries from multiple trusted sources, with key points and detailed AI explainers on demand.</p>
          <p className="landing-footer__copy">© {new Date().getFullYear()} CURA News. Summaries may contain inaccuracies.</p>
        </div>
      </footer>
    </div>
  );
}
