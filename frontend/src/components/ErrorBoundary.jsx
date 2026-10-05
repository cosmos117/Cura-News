import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Catches render-time errors so a thrown exception shows a recoverable UI
 * instead of a blank page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled render error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="page page--centered page--tinted">
        <div className="card card--centered">
          <div className="error-state">
            <div className="error-state__icon error-state__icon--danger">
              <AlertTriangle className="icon icon--xl" />
            </div>

            <h1 className="title-lg">Something went wrong</h1>

            <p className="text-sm text-muted error-state__hint">
              The page failed to render. You can try again, or reload the app.
            </p>

            <div className="row row-3 error-state__actions">
              <button onClick={this.handleReset} className="btn btn-primary">
                <RefreshCw className="icon icon--md" />
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn btn-secondary"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}