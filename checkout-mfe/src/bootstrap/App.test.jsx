import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, {
  getCart,
  setCart,
  getStoredAuth,
  getTotal,
  getProductTitle,
  getProductDescription,
  getProductImage
} from './App';

describe('checkout-mfe App Component & Helpers', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    global.fetch = originalFetch;

    delete window.location;
    window.location = {
      ...originalLocation,
      href: 'http://localhost/checkout'
    };
  });

  afterEach(() => {
    window.location = originalLocation;
    global.fetch = originalFetch;
  });

  describe('Helper Functions', () => {
    it('getCart returns array or empty fallback', () => {
      expect(getCart()).toEqual([]);
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: '1', quantity: 1 }]));
      expect(getCart()).toEqual([{ productId: '1', quantity: 1 }]);

      // Corrupted / malformed JSON
      localStorage.setItem('mf_cart', 'invalid-json-{');
      expect(getCart()).toEqual([]);

      // Non-array JSON
      localStorage.setItem('mf_cart', '{"not": "array"}');
      expect(getCart()).toEqual([]);
    });

    it('setCart persists cart and count and dispatches mf-cart-changed', () => {
      const listener = jest.fn();
      window.addEventListener('mf-cart-changed', listener);

      const cart = [
        { productId: '1', quantity: 2 },
        { productId: '2', quantity: 1 }
      ];
      setCart(cart);

      expect(localStorage.getItem('mf_cart')).toBe(JSON.stringify(cart));
      expect(localStorage.getItem('mf_cart_count')).toBe('3');
      expect(listener).toHaveBeenCalledTimes(1);

      // Handle non-array or invalid cart passed
      setCart('invalid');
      expect(getCart()).toEqual([]);

      window.removeEventListener('mf-cart-changed', listener);
    });

    it('getStoredAuth returns parsed auth or null', () => {
      expect(getStoredAuth()).toBeNull();
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'abc' }));
      expect(getStoredAuth()).toEqual({ token: 'abc' });

      // Malformed auth JSON
      localStorage.setItem('mf_auth', 'corrupt-token-{');
      expect(getStoredAuth()).toBeNull();
    });

    it('getTotal computes sum of item price multiplied by quantity', () => {
      const cart = [
        { price: 100, quantity: 2 },
        { price: 50, quantity: 3 }
      ];
      expect(getTotal(cart)).toBe(350);
      expect(getTotal([])).toBe(0);
    });

    it('getProductTitle returns title or fallback', () => {
      expect(getProductTitle({ name: 'Item A' })).toBe('Item A');
      expect(getProductTitle({ title: 'Item B' })).toBe('Item B');
      expect(getProductTitle({})).toBe('Product');
      expect(getProductTitle(null)).toBe('Product');
    });

    it('getProductDescription returns description or fallback', () => {
      expect(getProductDescription({ description: 'Details' })).toBe('Details');
      expect(getProductDescription({})).toBe('No description available.');
    });

    it('getProductImage returns image url or fallback placeholder', () => {
      expect(getProductImage({ image: 'http://img.png' })).toBe('http://img.png');
      expect(getProductImage({})).toContain('via.placeholder.com');
    });
  });

  describe('App Component Rendering and Flow', () => {
    it('renders empty cart view when cart is empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(screen.getByRole('heading', { level: 1, name: 'Checkout' })).toBeInTheDocument();
      expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();

      const placeOrderBtn = screen.getByRole('button', { name: 'Place Order' });
      expect(placeOrderBtn).toBeDisabled();
    });

    it('renders cart items, enriches with stock from API, and calculates totals', async () => {
      const initialCart = [
        {
          productId: 'p1',
          name: 'Wireless Mouse',
          description: 'Ergonomic mouse',
          price: 500,
          quantity: 2
        }
      ];
      localStorage.setItem('mf_cart', JSON.stringify(initialCart));

      const mockProducts = [
        { _id: 'p1', title: 'Wireless Mouse', stock: 10 }
      ];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProducts)
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(await screen.findByText('Wireless Mouse')).toBeInTheDocument();
      expect(screen.getByText('Ergonomic mouse')).toBeInTheDocument();
      expect(screen.getByText('In stock')).toBeInTheDocument();

      // Summary checks
      expect(screen.getByText('Total Items')).toBeInTheDocument();
      expect(screen.getAllByText('2')).toHaveLength(2); // qty-value and summary total items
      expect(screen.getAllByText('₹1000')).toHaveLength(3); // item subtotal, Total Amount, Payable
    });

    it('updates item quantity and syncs to localStorage', async () => {
      const user = userEvent.setup();
      const initialCart = [
        { productId: 'p1', name: 'Keyboard', price: 1000, quantity: 1 }
      ];
      localStorage.setItem('mf_cart', JSON.stringify(initialCart));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ _id: 'p1', stock: 5 }])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      await screen.findByText('Keyboard');

      const plusBtn = screen.getByRole('button', { name: '+' });
      await user.click(plusBtn);

      expect(screen.getByText('2', { selector: '.qty-value' })).toBeInTheDocument();
      expect(getCart()[0].quantity).toBe(2);

      const minusBtn = screen.getByRole('button', { name: '-' });
      await user.click(minusBtn);

      expect(screen.getByText('1', { selector: '.qty-value' })).toBeInTheDocument();
      expect(getCart()[0].quantity).toBe(1);
    });

    it('disables plus button when quantity reaches available stock', async () => {
      const initialCart = [
        { productId: 'p1', name: 'Limited Edition Mug', price: 200, quantity: 2 }
      ];
      localStorage.setItem('mf_cart', JSON.stringify(initialCart));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ _id: 'p1', stock: 2 }])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      await screen.findByText('Only 2 left');

      const plusBtn = screen.getByRole('button', { name: '+' });
      expect(plusBtn).toBeDisabled();
    });

    it('removes item from cart when Remove button is clicked', async () => {
      const user = userEvent.setup();
      const initialCart = [
        { productId: 'p1', name: 'Item to Remove', price: 150, quantity: 1 }
      ];
      localStorage.setItem('mf_cart', JSON.stringify(initialCart));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      const removeBtn = await screen.findByRole('button', { name: 'Remove' });
      await user.click(removeBtn);

      expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();
      expect(getCart()).toEqual([]);
    });

    it('syncs cart when mf-cart-changed event is fired', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();

      act(() => {
        setCart([{ productId: 'p9', name: 'External Item', price: 300, quantity: 1 }]);
      });

      expect(await screen.findByText('External Item')).toBeInTheDocument();
    });
  });

  describe('Order Placement Workflow', () => {
    it('prompts user to login if not authenticated', async () => {
      const user = userEvent.setup();
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: 'p1', price: 100, quantity: 1 }]));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ _id: 'p1', stock: 5 }])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      const placeOrderBtn = await screen.findByRole('button', { name: 'Place Order' });
      await user.click(placeOrderBtn);

      expect(screen.getByText('Please login to continue.')).toBeInTheDocument();
    });

    it('displays error if an item in cart is out of stock', async () => {
      const user = userEvent.setup();
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'test-token' }));
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: 'p1', name: 'Mug', price: 100, quantity: 1 }]));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ _id: 'p1', title: 'Mug', stock: 0 }])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      const placeOrderBtn = await screen.findByRole('button', { name: 'Place Order' });
      await user.click(placeOrderBtn);

      expect(screen.getByText('Product "Mug" is out of stock.')).toBeInTheDocument();
    });

    it('displays error if item quantity exceeds available stock', async () => {
      const user = userEvent.setup();
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'test-token' }));
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: 'p1', name: 'Hat', price: 100, quantity: 5 }]));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ _id: 'p1', title: 'Hat', stock: 3 }])
      });

      render(<App apiBaseUrl="http://localhost:8080" />);

      const placeOrderBtn = await screen.findByRole('button', { name: 'Place Order' });
      await user.click(placeOrderBtn);

      expect(screen.getByText('Only 3 item(s) available for Hat.')).toBeInTheDocument();
    });

    it('places order successfully, clears cart, and redirects to /orders', async () => {
      const user = userEvent.setup();
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'valid-token' }));
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: 'p1', price: 200, quantity: 2 }]));

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([{ _id: 'p1', stock: 10 }])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ orderId: 'ord-999', status: 'created' })
        });

      render(<App apiBaseUrl="http://localhost:8080" />);

      const placeOrderBtn = await screen.findByRole('button', { name: 'Place Order' });
      await user.click(placeOrderBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-token'
          },
          body: JSON.stringify({
            items: [{ productId: 'p1', price: 200, quantity: 2 }]
          })
        });
      });

      expect(localStorage.getItem('mf_cart')).toBeNull();
      expect(localStorage.getItem('mf_cart_count')).toBe('0');
      expect(window.location.href).toBe('/orders');
    });

    it('handles server failure during order placement', async () => {
      const user = userEvent.setup();
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'valid-token' }));
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: 'p1', price: 200, quantity: 1 }]));

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([{ _id: 'p1', stock: 10 }])
        })
        .mockResolvedValueOnce({
          ok: false,
          json: jest.fn().mockResolvedValue({ message: 'Payment gateway rejected transaction' })
        });

      render(<App apiBaseUrl="http://localhost:8080" />);

      const placeOrderBtn = await screen.findByRole('button', { name: 'Place Order' });
      await user.click(placeOrderBtn);

      expect(await screen.findByText('Payment gateway rejected transaction')).toBeInTheDocument();
    });

    it('handles network failure during order placement', async () => {
      const user = userEvent.setup();
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'valid-token' }));
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: 'p1', price: 200, quantity: 1 }]));

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([{ _id: 'p1', stock: 10 }])
        })
        .mockRejectedValueOnce(new Error('Network disconnected'));

      render(<App apiBaseUrl="http://localhost:8080" />);

      const placeOrderBtn = await screen.findByRole('button', { name: 'Place Order' });
      await user.click(placeOrderBtn);

      expect(await screen.findByText('Unable to place order.')).toBeInTheDocument();
    });
  });
});
