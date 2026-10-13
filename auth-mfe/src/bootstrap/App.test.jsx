import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { setStoredAuth } from './App';

describe('auth-mfe App Component', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    global.fetch = originalFetch;

    delete window.location;
    window.location = {
      ...originalLocation,
      assign: jest.fn(),
      href: 'http://localhost/'
    };
  });

  afterEach(() => {
    window.location = originalLocation;
    global.fetch = originalFetch;
  });

  describe('setStoredAuth helper', () => {
    it('persists data to localStorage and fires mf-auth-changed event', () => {
      const listener = jest.fn();
      window.addEventListener('mf-auth-changed', listener);

      const data = { token: 'token-999', user: { name: 'Alice' } };
      setStoredAuth(data);

      expect(localStorage.getItem('mf_auth')).toBe(JSON.stringify(data));
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener('mf-auth-changed', listener);
    });
  });

  describe('Login Mode (default)', () => {
    it('renders login view correctly by default', () => {
      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument();
      expect(screen.getByText('Access your account to continue shopping.')).toBeInTheDocument();

      // Email and password should exist, name should NOT
      expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Enter your name')).not.toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: 'Login' });
      expect(submitBtn).toBeInTheDocument();
      expect(submitBtn).not.toBeDisabled();

      const switchLink = screen.getByRole('link', { name: 'Create an account' });
      expect(switchLink).toBeInTheDocument();
      expect(switchLink).toHaveAttribute('href', '/signup');
      expect(screen.getByText(/New to the store\?/i)).toBeInTheDocument();
    });

    it('updates form values on user input', async () => {
      const user = userEvent.setup();
      render(<App apiBaseUrl="http://localhost:8080" mode="login" />);

      const emailInput = screen.getByPlaceholderText('Enter email');
      const passwordInput = screen.getByPlaceholderText('Enter password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'secret123');

      expect(emailInput).toHaveValue('test@example.com');
      expect(passwordInput).toHaveValue('secret123');
    });

    it('handles successful login and redirects after timeout', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      const authPayload = { token: 'jwt-login-token', user: { id: 'u1' } };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(authPayload)
      });

      render(<App apiBaseUrl="http://localhost:8080" mode="login" />);

      await user.type(screen.getByPlaceholderText('Enter email'), 'user@example.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'password123');

      await user.click(screen.getByRole('button', { name: 'Login' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: 'user@example.com',
            password: 'password123'
          })
        });
      });

      expect(await screen.findByText('Login successful.')).toBeInTheDocument();
      expect(localStorage.getItem('mf_auth')).toBe(JSON.stringify(authPayload));

      // Advance timer for redirect
      jest.advanceTimersByTime(1300);
      expect(window.location.assign).toHaveBeenCalledWith('/');

      jest.useRealTimers();
    });

    it('handles server error with message', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Invalid email or password' })
      });

      render(<App apiBaseUrl="http://localhost:8080" mode="login" />);

      await user.type(screen.getByPlaceholderText('Enter email'), 'wrong@example.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'badpassword');
      await user.click(screen.getByRole('button', { name: 'Login' }));

      expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Login' })).not.toBeDisabled();
    });

    it('handles server error without custom message using fallback', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({})
      });

      render(<App apiBaseUrl="http://localhost:8080" mode="login" />);

      await user.type(screen.getByPlaceholderText('Enter email'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'pass');
      await user.click(screen.getByRole('button', { name: 'Login' }));

      expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    });

    it('handles network failure gracefully', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      render(<App apiBaseUrl="http://localhost:8080" mode="login" />);

      await user.type(screen.getByPlaceholderText('Enter email'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'pass');
      await user.click(screen.getByRole('button', { name: 'Login' }));

      expect(await screen.findByText('Unable to complete request.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Login' })).not.toBeDisabled();
    });
  });

  describe('Register Mode', () => {
    it('renders register view correctly', () => {
      render(<App apiBaseUrl="http://localhost:8080" mode="register" />);

      expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
      expect(screen.getByText('Join and start your ecommerce experience.')).toBeInTheDocument();

      expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: 'Create account' });
      expect(submitBtn).toBeInTheDocument();

      const switchLink = screen.getByRole('link', { name: 'Log in' });
      expect(switchLink).toBeInTheDocument();
      expect(switchLink).toHaveAttribute('href', '/login');
      expect(screen.getByText(/Already have an account\?/i)).toBeInTheDocument();
    });

    it('handles successful registration', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      const regPayload = { token: 'jwt-register-token', user: { name: 'New User' } };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(regPayload)
      });

      render(<App apiBaseUrl="http://localhost:8080" mode="register" />);

      await user.type(screen.getByPlaceholderText('Enter your name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('Enter email'), 'john@example.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'pass1234');

      await user.click(screen.getByRole('button', { name: 'Create account' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'John Doe',
            email: 'john@example.com',
            password: 'pass1234'
          })
        });
      });

      expect(await screen.findByText('Registration successful.')).toBeInTheDocument();
      expect(localStorage.getItem('mf_auth')).toBe(JSON.stringify(regPayload));

      jest.advanceTimersByTime(1300);
      expect(window.location.assign).toHaveBeenCalledWith('/');

      jest.useRealTimers();
    });

    it('handles registration network failure', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection dropped'));

      render(<App apiBaseUrl="http://localhost:8080" mode="register" />);

      await user.type(screen.getByPlaceholderText('Enter your name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('Enter email'), 'john@example.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'pass1234');

      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(await screen.findByText('Unable to complete request.')).toBeInTheDocument();
    });
  });
});
