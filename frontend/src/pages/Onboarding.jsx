import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { meAPI } from "../services/api";
import {
  NEWS_SOURCES,
  PICKABLE_TOPICS,
  TOPIC_ID_BY_LABEL,
  TOPIC_LABEL_BY_ID,
  getCategoryClass,
} from "../constants/news";
import { SOURCE_PROFILES } from "../constants/sources";
import { topicIcon } from "../constants/topicIcons";
import { saveFeedMode } from "../utils/feedMode";
import { getErrorMessage } from "../utils/format";

/**
 * The For You picker: which papers and topics the reader wants.
 *
 * Shown once straight after sign-up, and again from the dashboard to change
 * the picks. Two steps (papers, then topics) slide in turn, then a short
 * "all set" screen hands over to the For You feed.
 */

const STEP_SOURCES = 0;
const STEP_TOPICS = 1;
const STEP_DONE = 2;
// Length of the .onb-step--leave-* animations in index.css.
const LEAVE_MS = 200;
// How long the "all set" screen stays before the feed opens on its own.
const DONE_REDIRECT_MS = 2600;

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

const toggle = (list, value) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/**
 * Toggle on the first click of a burst only. A double or rapid click would
 * otherwise flip a card on and off again, which looks like the page ignored
 * the click. event.detail counts consecutive clicks; keyboard presses report 0.
 */
const firstClickOnly = (handler) => (event) => {
  if (event.detail > 1) return;
  handler();
};

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function Onboarding() {
  const { user, updatePreferences } = useAuth();
  const navigate = useNavigate();
  const saved = user?.preferences || {};
  // Captured once: saving sets onboardedAt, but the copy should not change
  // halfway through the flow.
  const [firstRun] = useState(() => !saved.onboardedAt);

  const [step, setStep] = useState(STEP_SOURCES);
  const [direction, setDirection] = useState("next");
  const [leaving, setLeaving] = useState(false);
  // All three papers start ticked: most readers want them all.
  const [sources, setSources] = useState(() =>
    saved.sources?.length ? saved.sources : NEWS_SOURCES,
  );
  const [topics, setTopics] = useState(() =>
    (saved.topics || []).map((id) => TOPIC_LABEL_BY_ID[id]).filter(Boolean),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const timers = useRef([]);
  const headingRef = useRef(null);
  // Set while a step is sliding or picks are saving. A ref, not state: rapid
  // clicks land before a re-render, so state would let them all through and
  // stack up overlapping transitions and saves (which froze the screen).
  const busy = useRef(false);

  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  // Each new step's heading takes focus, so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const later = (callback, ms) => {
    timers.current.push(window.setTimeout(callback, ms));
  };

  /**
   * Play the current step's exit, then mount the next one (it animates in).
   * Expects `busy` to be held; releases it afterwards unless `release` is
   * false, which is how the finished flow stays locked for good.
   */
  const transition = (nextStep, { release = true } = {}) => {
    setError(null);
    setDirection(nextStep > step ? "next" : "back");
    if (prefersReducedMotion()) {
      setStep(nextStep);
      if (release) busy.current = false;
      return;
    }
    setLeaving(true);
    later(() => {
      setLeaving(false);
      setStep(nextStep);
      if (release) busy.current = false;
    }, LEAVE_MS);
  };

  const goTo = (nextStep) => {
    if (busy.current) return;
    busy.current = true;
    transition(nextStep);
  };

  const openFeed = () => navigate("/dashboard", { replace: true });

  const finish = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await meAPI.savePreferences({
        sources,
        topics: topics.map((label) => TOPIC_ID_BY_LABEL[label]),
      });
      updatePreferences(response.data.preferences);
      saveFeedMode("for-you");
      // Saved: the flow is over, so the lock is never released. A click that
      // lands on the old step mid-slide can no longer save a second time.
      transition(STEP_DONE, { release: false });
      later(openFeed, DONE_REDIRECT_MS);
    } catch (err) {
      busy.current = false;
      setError(getErrorMessage(err, "Your picks could not be saved. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    if (busy.current) return;
    busy.current = true;
    if (firstRun) {
      try {
        const response = await meAPI.skipOnboarding();
        updatePreferences(response.data.preferences);
      } catch {
        // Best effort: the dashboard works without picks, and the For You
        // button offers this picker again.
      }
    }
    openFeed();
  };

  const firstName = user?.name?.split(/\s+/)[0] || "there";
  const canContinue = step === STEP_SOURCES ? sources.length > 0 : topics.length > 0;
  const stepClass = `onb-step onb-step--${leaving ? "leave" : "enter"}-${direction}`;

  return (
    <div className="onb">
      <div className="onb__panel">
        <header className="onb__top">
          <span className="onb__brand">
            <img src="/logo.svg" alt="" width="36" height="36" />
            CURA News
          </span>
          {step !== STEP_DONE && (
            <span className="onb__step-label">Step {step + 1} of 2</span>
          )}
        </header>

        <div className="onb__progress" aria-hidden="true">
          <span className="is-filled" />
          <span className={step >= STEP_TOPICS ? "is-filled" : ""} />
        </div>

        <div className="onb__body">
          <div key={step} className={stepClass}>
            {step === STEP_SOURCES && (
              <>
                <h1 className="onb__title" tabIndex={-1} ref={headingRef}>
                  {firstRun ? `Welcome, ${firstName}! ` : ""}Which papers do you read?
                </h1>
                <p className="onb__lead">
                  Pick one or more. Your For You feed only shows stories from these.
                </p>

                <ul className="onb-sources">
                  {NEWS_SOURCES.map((source, index) => {
                    const selected = sources.includes(source);
                    const profile = SOURCE_PROFILES[source];
                    return (
                      <li key={source} className="onb-cell" style={{ "--i": index }}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={firstClickOnly(() => setSources((list) => toggle(list, source)))}
                          className={`onb-source${selected ? " onb-source--selected" : ""}`}
                        >
                          <span className="onb-source__logo">
                            <img src={profile.logo} alt="" />
                          </span>
                          <span className="onb-source__info">
                            <span className="onb-source__name">{source}</span>
                            <span className="onb-source__meta">{profile.meta}</span>
                            <span className="onb-source__text">{profile.text}</span>
                          </span>
                          {selected && (
                            <span className="onb-check" aria-hidden="true">
                              <Check className="icon icon--sm" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="onb-toolbar">
                  <p className="onb-count" aria-live="polite">
                    <span key={sources.length} className="onb-count__num">
                      {sources.length}
                    </span>
                    of 3 papers selected
                  </p>
                </div>
              </>
            )}

            {step === STEP_TOPICS && (
              <>
                <h1 className="onb__title" tabIndex={-1} ref={headingRef}>
                  What do you want to follow?
                </h1>
                <p className="onb__lead">
                  Pick at least one. We will build your feed from these topics.
                </p>

                <div className="onb-toolbar">
                  <p className="onb-count" aria-live="polite">
                    <span key={topics.length} className="onb-count__num">
                      {topics.length}
                    </span>
                    {topics.length === 1 ? "topic" : "topics"} selected
                  </p>
                  <button
                    type="button"
                    className="link-quiet"
                    onClick={() =>
                      setTopics(topics.length === PICKABLE_TOPICS.length ? [] : PICKABLE_TOPICS)
                    }
                  >
                    {topics.length === PICKABLE_TOPICS.length ? "Clear all" : "Select all"}
                  </button>
                </div>

                <ul className="onb-topics">
                  {PICKABLE_TOPICS.map((topic, index) => {
                    const selected = topics.includes(topic);
                    const Icon = topicIcon(topic);
                    const colour = getCategoryClass(topic).replace("cat-", "");
                    return (
                      <li key={topic} className="onb-cell" style={{ "--i": index }}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={firstClickOnly(() => setTopics((list) => toggle(list, topic)))}
                          className={`onb-topic topic-card--${colour}${
                            selected ? " onb-topic--selected" : ""
                          }`}
                        >
                          <span className="topic-card__icon">
                            <Icon className="icon icon--md" />
                          </span>
                          <span className="onb-topic__label">{topic}</span>
                          <span className="onb-topic__tick" aria-hidden="true">
                            {selected && <Check className="icon icon--sm" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {step === STEP_DONE && (
              <div className="onb-done">
                <svg className="onb-done__mark" viewBox="0 0 96 96" aria-hidden="true">
                  <circle cx="48" cy="48" r="44" />
                  <path d="M29 50 L42 63 L67 35" pathLength="1" />
                </svg>
                <h1 className="onb__title" tabIndex={-1} ref={headingRef}>
                  {firstRun ? `You're all set, ${firstName}!` : "Your picks are updated"}
                </h1>
                <p className="onb__lead">
                  Building your For You feed from {plural(sources.length, "paper")} and{" "}
                  {plural(topics.length, "topic")}...
                </p>
                <ul className="onb-done__picks">
                  {[...sources, ...topics].map((pick, index) => (
                    <li key={pick} className="onb-done__chip" style={{ "--i": index }}>
                      {pick}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-primary" onClick={openFeed}>
                  Open my feed
                  <ArrowRight className="icon icon--md" />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="alert alert--error onb__error" role="alert">
              <AlertCircle className="icon icon--lg" />
              <p className="alert-body">{error}</p>
            </div>
          )}
        </div>

        {step !== STEP_DONE && (
          <footer className="onb__footer">
            {step === STEP_SOURCES ? (
              <button type="button" className="btn btn-ghost" onClick={skip}>
                {firstRun ? "Skip for now" : "Cancel"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => goTo(STEP_SOURCES)}
                disabled={saving || leaving}
              >
                <ArrowLeft className="icon icon--md" />
                Back
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary onb__next"
              disabled={!canContinue || saving || leaving}
              onClick={step === STEP_SOURCES ? () => goTo(STEP_TOPICS) : finish}
            >
              {saving ? (
                <>
                  <Loader className="icon icon--sm spinner spinner--sm" />
                  Saving...
                </>
              ) : step === STEP_SOURCES ? (
                <>
                  Continue
                  <ArrowRight className="icon icon--md" />
                </>
              ) : (
                <>
                  Build my feed
                  <Sparkles className="icon icon--md" />
                </>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
