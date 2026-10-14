import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { clearLogs, getLogs } from '../lib/logger';

function ThrowingComponent({ shouldThrow, message }) {
  if (shouldThrow) {
    throw new Error(message || 'Test render failure');
  }
  return <div>Normal Content</div>;
}

describe('auth-mfe ErrorBoundary component', () => {
  const originalError = console.error;

  beforeEach(() => {
    clearLogs();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalError;
    clearLogs();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary appName='auth-mfe'>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
    expect(getLogs()).toHaveLength(0);
  });

  it('catches render error, renders fallback UI, and logs error with react_boundary category', () => {
    render(
      <ErrorBoundary appName='auth-mfe'>
        <ThrowingComponent shouldThrow={true} message='Auth render crash' />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(
      screen.getByText('Unable to display this section. Please try again.')
    ).toBeInTheDocument();

    const logs = getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const boundaryLog = logs.find((l) => l.category === 'react_boundary');
    expect(boundaryLog).toBeDefined();
    expect(boundaryLog.appName).toBe('auth-mfe');
    expect(boundaryLog.message).toBe('Auth render crash');
    expect(boundaryLog.metadata.componentStack).toBeDefined();
  });

  it('supports custom title, description, and retry label', () => {
    render(
      <ErrorBoundary
        appName='auth-mfe'
        title='Authentication Unavailable'
        description='Please refresh your browser.'
        retryLabel='Reload Auth'
      >
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Authentication Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('Please refresh your browser.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reload Auth' })
    ).toBeInTheDocument();
  });

  it('supports functional fallback prop', () => {
    const customFallback = jest.fn(({ error }) => (
      <div>Custom Auth Error: {error.message}</div>
    ));

    render(
      <ErrorBoundary appName='auth-mfe' fallback={customFallback}>
        <ThrowingComponent shouldThrow={true} message='Custom crash' />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Auth Error: Custom crash')).toBeInTheDocument();
    expect(customFallback).toHaveBeenCalled();
  });

  it('recovers when reset button is clicked and child no longer throws', () => {
    let throwError = true;
    function ConditionalThrower() {
      if (throwError) {
        throw new Error('Temporary glitch');
      }
      return <div>Recovered Auth</div>;
    }

    render(
      <ErrorBoundary appName='auth-mfe'>
        <ConditionalThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();

    throwError = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Recovered Auth')).toBeInTheDocument();
  });

  it('calls optional onError callback when error is caught', () => {
    const onErrorMock = jest.fn();

    render(
      <ErrorBoundary appName='auth-mfe' onError={onErrorMock}>
        <ThrowingComponent shouldThrow={true} message='Callback test' />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Callback test' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });
});
