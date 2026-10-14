import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './bootstrap/App';
import { initGlobalErrorHandlers } from './lib/logger';

initGlobalErrorHandlers('frontend-shell');

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No #root element found');
}

createRoot(rootElement).render(<App />);
