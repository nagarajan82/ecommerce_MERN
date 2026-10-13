import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import App, { getStoredAuth } from './App';

describe('orders-mfe App Component & Helpers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  describe('getStoredAuth helper', () => {
    it('returns null when no auth stored', () => {
      expect(getStoredAuth()).toBeNull();
    });

    it('returns parsed auth object when present in localStorage', () => {
      const user = { token: 'jwt-orders', user: { id: 'u100' } };
      localStorage.setItem('mf_auth', JSON.stringify(user));
      expect(getStoredAuth()).toEqual(user);
    });

    it('returns null on malformed JSON', () => {
      localStorage.setItem('mf_auth', 'invalid-json{{');
      expect(getStoredAuth()).toBeNull();
    });
  });

  describe('Authentication Guard', () => {
    it('shows login prompt message and does not fetch orders when unauthenticated', () => {
      global.fetch = jest.fn();

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(screen.getByText('Please login to view orders.')).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Authenticated Order History', () => {
    beforeEach(() => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'test-token-xyz' }));
    });

    it('shows empty state when user has no orders', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(await screen.findByText('No orders found yet.')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/orders', {
        headers: {
          Authorization: 'Bearer test-token-xyz'
        }
      });
    });

    it('renders orders list with truncated id, status, total amount, and items breakdown', async () => {
      const mockOrders = [
        {
          _id: '670be83993c834a001a1b2c3',
          status: 'completed',
          totalAmount: 1500,
          items: [
            { productId: 'p1', name: 'Running Shoes', price: 1000, quantity: 1 },
            { productId: 'p2', name: 'Cotton Socks', price: 250, quantity: 2 }
          ]
        }
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockOrders)
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(screen.getByRole('heading', { level: 1, name: 'Your Orders' })).toBeInTheDocument();
      expect(screen.getByText(/This page auto-refreshes/i)).toBeInTheDocument();

      // Check order details
      expect(await screen.findByText('Order #01a1b2c3')).toBeInTheDocument();
      expect(screen.getByText('Status: completed')).toBeInTheDocument();
      expect(screen.getByText('₹1500')).toBeInTheDocument();

      // Check items breakdown
      expect(screen.getByText('Running Shoes')).toBeInTheDocument();
      expect(screen.getByText('1 × ₹1000')).toBeInTheDocument();
      expect(screen.getByText('Cotton Socks')).toBeInTheDocument();
      expect(screen.getByText('2 × ₹250')).toBeInTheDocument();
    });

    it('handles orders with empty items gracefully', async () => {
      const mockOrders = [
        {
          _id: '12345678abcdef00',
          status: 'pending',
          totalAmount: 0
        }
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockOrders)
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(await screen.findByText('Order #abcdef00')).toBeInTheDocument();
      expect(screen.getByText('Status: pending')).toBeInTheDocument();
    });

    it('handles server error response with custom message', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Order service rate limited' })
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(await screen.findByText('Order service rate limited')).toBeInTheDocument();
    });

    it('handles server error response without message with fallback', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({})
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(await screen.findByText('Unable to load orders.')).toBeInTheDocument();
    });

    it('handles network failure during orders fetch', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(await screen.findByText('Unable to load orders.')).toBeInTheDocument();
    });

    it('polls for live updates every 3 seconds', async () => {
      jest.useFakeTimers();

      const initialOrders = [
        {
          _id: 'order12345678',
          status: 'processing',
          totalAmount: 499,
          items: [{ productId: 'p1', name: 'Book', price: 499, quantity: 1 }]
        }
      ];

      const updatedOrders = [
        {
          _id: 'order12345678',
          status: 'delivered',
          totalAmount: 499,
          items: [{ productId: 'p1', name: 'Book', price: 499, quantity: 1 }]
        }
      ];

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(initialOrders)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(updatedOrders)
        });

      render(<App apiBaseUrl="http://localhost:8080" />);

      // Flush first fetch
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Status: processing')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Fast forward 3 seconds for interval poll
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Status: delivered')).toBeInTheDocument();
    });

    it('clears interval on component unmount', async () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      });

      const { unmount } = render(<App apiBaseUrl="http://localhost:8080" />);

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });
});
