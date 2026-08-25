import { Component, type ReactNode } from 'react';

import { ErrorState } from './ErrorState';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Catches render errors thrown outside the router (providers, ChatbotWidget, Toaster),
// which route-level errorElements never see since they aren't part of the router tree.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          description={this.state.error?.message}
          onRetry={() => window.location.assign(window.location.pathname)}
        />
      );
    }
    return this.props.children;
  }
}
