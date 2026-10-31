import { useNavigate } from "react-router-dom";
import { Clock, Sparkles } from "lucide-react";

/** The For You / Latest tabs, with a line describing the active feed. */
export default function FeedSwitch({ forYou, hasPicks, pickedSources, pickedTopics, onChoose }) {
  const navigate = useNavigate();
  const editPicks = () => navigate("/welcome");

  return (
    <section className="feed-switch" aria-label="Choose your feed">
      <div
        className="feed-switch__tabs"
        role="group"
        aria-label="Feed"
        data-active={forYou ? "for-you" : "latest"}
      >
        <span className="feed-switch__indicator" aria-hidden="true" />
        <button
          type="button"
          aria-pressed={forYou}
          onClick={() => onChoose("for-you")}
          className={`feed-switch__tab${forYou ? " feed-switch__tab--active" : ""}`}
        >
          <Sparkles className="icon icon--md" />
          For You
        </button>
        <button
          type="button"
          aria-pressed={!forYou}
          onClick={() => onChoose("latest")}
          className={`feed-switch__tab${!forYou ? " feed-switch__tab--active" : ""}`}
        >
          <Clock className="icon icon--md" />
          Latest
        </button>
      </div>

      {forYou ? (
        <p className="feed-switch__summary">
          <span>
            Your picks: <strong>{pickedSources.join(", ")}</strong> ·{" "}
            <strong>
              {pickedTopics.length} {pickedTopics.length === 1 ? "topic" : "topics"}
            </strong>
          </span>
          <button type="button" className="link-quiet" onClick={editPicks}>
            Edit picks
          </button>
        </p>
      ) : !hasPicks ? (
        <p className="feed-switch__summary">
          <span>Get a feed of just the papers and topics you care about.</span>
          <button type="button" className="link-quiet" onClick={editPicks}>
            Set up For You
          </button>
        </p>
      ) : (
        <p className="feed-switch__summary">
          <span>Everything from all three papers, newest first.</span>
        </p>
      )}
    </section>
  );
}
