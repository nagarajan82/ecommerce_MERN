import {
  apiBaseUrl,
  request,
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  getAuthToken,
  authHeaders
} from './api';

describe('auth-mfe api utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('apiBaseUrl', () => {
    it('has a defined fallback apiBaseUrl', () => {
      expect(apiBaseUrl).toBeDefined();
      expect(typeof apiBaseUrl).toBe('string');
    });
  });

  describe('getStoredAuth', () => {
    it('returns null when no auth stored', () => {
      expect(getStoredAuth()).toBeNull();
    });

    it('returns parsed auth object when present in localStorage', () => {
      const user = { token: 'jwt-123', user: { id: 'u1', name: 'Alice' } };
      localStorage.setItem('mf_auth', JSON.stringify(user));
      expect(getStoredAuth()).toEqual(user);
    });

    it('returns null on malformed JSON in localStorage', () => {
      localStorage.setItem('mf_auth', 'invalid-json{');
      expect(getStoredAuth()).toBeNull();
    });
  });

  describe('setStoredAuth', () => {
    it('saves auth data to localStorage and dispatches mf-auth-changed event', () => {
      const listener = jest.fn();
      window.addEventListener('mf-auth-changed', listener);

      const authData = { token: 'jwt-abc', name: 'Bob' };
      setStoredAuth(authData);

      expect(localStorage.getItem('mf_auth')).toBe(JSON.stringify(authData));
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener('mf-auth-changed', listener);
    });
  });

  describe('clearStoredAuth', () => {
    it('removes mf_auth from localStorage and dispatches mf-auth-changed event', () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'test' }));
      const listener = jest.fn();
      window.addEventListener('mf-auth-changed', listener);

      clearStoredAuth();

      expect(localStorage.getItem('mf_auth')).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener('mf-auth-changed', listener);
    });
  });

  describe('getAuthToken', () => {
    it('returns empty string when no auth exists', () => {
      expect(getAuthToken()).toBe('');
    });

    it('returns the token string when auth exists', () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'my-token' }));
      expect(getAuthToken()).toBe('my-token');
    });
  });

  describe('authHeaders', () => {
    it('returns empty object when no token is present', () => {
      expect(authHeaders()).toEqual({});
    });

    it('returns Authorization header when token is present', () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'secret-token' }));
      expect(authHeaders()).toEqual({ Authorization: 'Bearer secret-token' });
    });
  });

  describe('request', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('performs successful json GET request with default headers', async () => {
      const mockData = { id: 1, name: 'Sample' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue(mockData)
      });

      const result = await request('/api/sample');
      expect(global.fetch).toHaveBeenCalledWith(`${apiBaseUrl}/api/sample`, {
        headers: { 'Content-Type': 'application/json' }
      });
      expect(result).toEqual(mockData);
    });

    it('performs successful request and parses text when content-type is text', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('text/plain')
        },
        text: jest.fn().mockResolvedValue('Plain response')
      });

      const result = await request('/api/health');
      expect(result).toBe('Plain response');
    });

    it('merges custom headers with default headers', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ ok: true })
      });

      await request('/api/custom', {
        headers: { 'X-Custom-Header': 'CustomValue' }
      });

      expect(global.fetch).toHaveBeenCalledWith(`${apiBaseUrl}/api/custom`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'CustomValue'
        }
      });
    });

    it('throws error with server message when response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ message: 'Invalid credentials' })
      });

      await expect(request('/api/login')).rejects.toThrow('Invalid credentials');
    });

    it('throws default "Request failed" when error payload lacks message', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        headers: {
          get: jest.fn().mockReturnValue('text/plain')
        },
        text: jest.fn().mockResolvedValue('Server error')
      });

      await expect(request('/api/fail')).rejects.toThrow('Request failed');
    });
  });
});
