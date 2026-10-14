import React, { Component } from 'react';
import { createLogger } from '../lib/logger';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.logger = props.logger || createLogger(props.appName || 'catalog-mfe');
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    try {
      if (error && typeof error === 'object') {
        error.__handledByBoundary = true;
      }
      this.logger.error(error?.message || 'Component render error', {
        category: 'react_boundary',
        componentStack: errorInfo?.componentStack || '',
        error: {
          name: error?.name || 'Error',
          message: error?.message || 'Component render error',
          stack: error?.stack || ''
        }
      });
    } catch (_) {}

    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError(error, errorInfo);
      } catch (_) {}
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          resetError: this.resetError
        });
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          className='error-boundary-fallback page-card'
          role='alert'
          style={{ padding: '24px', textAlign: 'center', margin: '16px auto' }}
        >
          <h2>{this.props.title || 'Something went wrong.'}</h2>
          <p>
            {this.props.description ||
              'Unable to display this section. Please try again.'}
          </p>
          <button
            type='button'
            onClick={this.resetError}
            className='btn btn-secondary'
            style={{ marginTop: '12px' }}
          >
            {this.props.retryLabel || 'Try Again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
