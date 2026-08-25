import React from 'react';
import ReactDOM from 'react-dom/client';

import { AppRouter } from './app/router/AppRouter';
import { ErrorBoundary } from './components/feedback';
import { AppProviders } from './providers/AppProviders';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  </React.StrictMode>,
);
