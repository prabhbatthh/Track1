import { Component, type ReactNode } from 'react';

import { ErrorState } from './ErrorState';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Catches render errors thrown outside the router (providers, ChatbotWidget, Toaster),
// which route-level errorElements never see since they aren't part of the router tree.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorState onRetry={() => window.location.assign('/')} />;
    }
    return this.props.children;
  }
}
