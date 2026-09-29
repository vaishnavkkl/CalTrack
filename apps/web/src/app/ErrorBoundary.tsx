import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page rendering failed', error, info);
  }

  render() {
    if (this.state.failed) {
      return <main className="error-page">
        <div className="card">
          <span className="eyebrow">PAGE ERROR</span>
          <h1>This page could not be displayed.</h1>
          <p>Your data is safe. Reload the page to try again.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </main>;
    }
    return this.props.children;
  }
}
