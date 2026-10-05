import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page page--centered page--tinted">
      <div className="error-state">
        <div className="error-state__icon">
          <Compass className="icon icon--xl" />
        </div>

        <h1 className="error-state__code">404</h1>

        <p className="text-muted error-state__hint">
          We couldn't find that page.
        </p>

        <Link to="/dashboard" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}