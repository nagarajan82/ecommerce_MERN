import {
  apiBaseUrl,
  request,
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  getAuthToken,
  authHeaders
} from './api';

describe('api utility module', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('apiBaseUrl', () => {
    it('provides a default or configured API base URL', () => {
      expect(typeof apiBaseUrl).toBe('string');
      expect(apiBaseUrl).toMatch(/^http:\/\/localhost:8080/);
    });
  });

  describe('getStoredAuth', () => {
    it('returns null when no auth exists in localStorage', () => {
      expect(getStoredAuth()).toBeNull();
    });

    it('returns parsed auth object when valid JSON exists in localStorage', () => {
      const mockAuth = { token: 'jwt-123', user: { id: 1, name: 'Alice' } };
      localStorage.setItem('mf_auth', JSON.stringify(mockAuth));
      expect(getStoredAuth()).toEqual(mockAuth);
    });

    it('returns null when localStorage contains corrupted JSON', () => {
      localStorage.setItem('mf_auth', 'invalid-json-{');
      expect(getStoredAuth()).toBeNull();
    });
  });

  describe('setStoredAuth', () => {
    it('stores stringified auth in localStorage and dispatches mf-auth-changed event', () => {
      const listener = jest.fn();
      window.addEventListener('mf-auth-changed', listener);

      const mockAuth = { token: 'tok-abc', user: { id: 2 } };
      setStoredAuth(mockAuth);

      expect(localStorage.getItem('mf_auth')).toBe(JSON.stringify(mockAuth));
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
    it('returns token string when auth is stored', () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'my-token' }));
      expect(getAuthToken()).toBe('my-token');
    });

    it('returns empty string when no auth is stored', () => {
      expect(getAuthToken()).toBe('');
    });
  });

  describe('authHeaders', () => {
    it('returns Authorization header with Bearer token when authenticated', () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'secret-token' }));
      expect(authHeaders()).toEqual({ Authorization: 'Bearer secret-token' });
    });

    it('returns empty object when unauthenticated', () => {
      expect(authHeaders()).toEqual({});
    });
  });

  describe('request()', () => {
    it('makes fetch request with Content-Type and returns parsed JSON', async () => {
      const mockResponse = { id: 1, title: 'Item' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null)
        },
        json: async () => mockResponse
      });

      const result = await request('/api/products');

      expect(global.fetch).toHaveBeenCalledWith(
        `${apiBaseUrl}/api/products`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('merges custom options and headers', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => 'application/json'
        },
        json: async () => ({ success: true })
      });

      await request('/api/custom', {
        method: 'POST',
        headers: { 'X-Custom-Header': 'CustomValue' }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${apiBaseUrl}/api/custom`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'CustomValue'
          })
        })
      );
    });

    it('returns plain text when response is not application/json', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => 'text/plain'
        },
        text: async () => 'OK'
      });

      const result = await request('/health');
      expect(result).toBe('OK');
    });

    it('throws error with response message when response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        headers: {
          get: () => 'application/json'
        },
        json: async () => ({ message: 'Product not found' })
      });

      await expect(request('/api/products/999')).rejects.toThrow('Product not found');
    });

    it('throws default error message when response is not ok and has no message field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        headers: {
          get: () => 'text/html'
        },
        text: async () => 'Internal Server Error'
      });

      await expect(request('/api/error')).rejects.toThrow('Request failed');
    });
  });
});
