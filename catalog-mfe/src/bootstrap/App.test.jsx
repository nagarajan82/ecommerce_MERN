import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App, {
  getProductTitle,
  getProductDescription,
  getProductImage,
  formatCategoryTitle,
  getCart,
  setCart,
  addToCart,
  ProductCard,
  ProductList,
  ProductDetails
} from './App';

describe('catalog-mfe App Component & Helpers', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    global.fetch = originalFetch;

    delete window.location;
    window.location = {
      ...originalLocation,
      reload: jest.fn(),
      href: 'http://localhost/'
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    window.location = originalLocation;
    global.fetch = originalFetch;
  });

  describe('Helper Functions', () => {
    it('getProductTitle returns title, name, or default "Product"', () => {
      expect(getProductTitle({ title: 'Laptop' })).toBe('Laptop');
      expect(getProductTitle({ name: 'Headphones' })).toBe('Headphones');
      expect(getProductTitle({})).toBe('Product');
      expect(getProductTitle(null)).toBe('Product');
    });

    it('getProductDescription returns description or fallback', () => {
      expect(getProductDescription({ description: 'Fast laptop' })).toBe('Fast laptop');
      expect(getProductDescription({})).toBe('No description available.');
      expect(getProductDescription(null)).toBe('No description available.');
    });

    it('getProductImage returns image url or fallback placeholder', () => {
      expect(getProductImage({ image: 'http://img.jpg' })).toBe('http://img.jpg');
      expect(getProductImage({})).toContain('via.placeholder.com');
      expect(getProductImage(null)).toContain('via.placeholder.com');
    });

    it('formatCategoryTitle formats category titles correctly and handles edge cases', () => {
      expect(formatCategoryTitle('')).toBe('Top deals for you');
      expect(formatCategoryTitle(null)).toBe('Top deals for you');
      expect(formatCategoryTitle(undefined)).toBe('Top deals for you');
      expect(formatCategoryTitle('electronics')).toBe('Electronics');
      expect(formatCategoryTitle('fashion')).toBe('Fashion');
      expect(formatCategoryTitle('accessories')).toBe('Accessories');
      expect(formatCategoryTitle('new-arrivals')).toBe('New Arrivals');
      expect(formatCategoryTitle('home_appliances')).toBe('Home Appliances');
    });

    it('getCart returns parsed array or empty array if null or malformed', () => {
      expect(getCart()).toEqual([]);
      localStorage.setItem('mf_cart', JSON.stringify([{ productId: 'p1', quantity: 2 }]));
      expect(getCart()).toEqual([{ productId: 'p1', quantity: 2 }]);

      // Corrupted / malformed JSON in localStorage
      localStorage.setItem('mf_cart', 'invalid-json-{');
      expect(getCart()).toEqual([]);

      // Valid JSON but not an array
      localStorage.setItem('mf_cart', '{"not": "array"}');
      expect(getCart()).toEqual([]);

      // Invalid cart passed to setCart
      setCart('invalid');
      expect(getCart()).toEqual([]);
    });

    it('setCart stores cart and count in localStorage and fires mf-cart-changed event', () => {
      const listener = jest.fn();
      window.addEventListener('mf-cart-changed', listener);

      const items = [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 3 }
      ];
      setCart(items);

      expect(localStorage.getItem('mf_cart')).toBe(JSON.stringify(items));
      expect(localStorage.getItem('mf_cart_count')).toBe('5');
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener('mf-cart-changed', listener);
    });

    describe('addToCart', () => {
      it('fails when product has no stock or stock <= 0', () => {
        const outOfStock = { _id: 'p1', title: 'Mug', stock: 0 };
        const result = addToCart(outOfStock);
        expect(result.ok).toBe(false);
        expect(result.message).toBe('Mug is out of stock.');
      });

      it('adds new product to cart when in stock', () => {
        const prod = { _id: 'p1', title: 'Mug', price: 150, stock: 5 };
        const result = addToCart(prod);
        expect(result.ok).toBe(true);
        expect(result.message).toBe('Mug added to cart.');
        expect(getCart()).toHaveLength(1);
        expect(getCart()[0]).toMatchObject({
          productId: 'p1',
          name: 'Mug',
          price: 150,
          quantity: 1
        });
      });

      it('increments quantity when adding same product again within stock', () => {
        const prod = { _id: 'p1', title: 'Mug', price: 150, stock: 5 };
        addToCart(prod);
        const result = addToCart(prod);
        expect(result.ok).toBe(true);
        expect(getCart()[0].quantity).toBe(2);
      });

      it('rejects adding beyond available stock', () => {
        const prod = { _id: 'p1', title: 'Mug', price: 150, stock: 1 };
        addToCart(prod); // quantity = 1, stock = 1
        const result = addToCart(prod);
        expect(result.ok).toBe(false);
        expect(result.message).toBe('Only 1 item(s) available for Mug.');
      });
    });
  });

  describe('ProductCard Component', () => {
    it('renders out of stock badge and disables add to cart button', () => {
      const product = { _id: 'p1', title: 'Out of Stock Item', price: 99, stock: 0 };
      const onAdd = jest.fn();

      render(
        <MemoryRouter>
          <ProductCard product={product} onAdd={onAdd} />
        </MemoryRouter>
      );

      expect(screen.getByText('Out of stock')).toBeInTheDocument();
      const addBtn = screen.getByRole('button', { name: 'Unavailable' });
      expect(addBtn).toBeDisabled();
    });

    it('renders low stock badge when stock <= 3', () => {
      const product = { _id: 'p2', title: 'Low Stock Item', price: 199, stock: 2 };
      render(
        <MemoryRouter>
          <ProductCard product={product} onAdd={jest.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByText('Only 2 left')).toBeInTheDocument();
    });

    it('renders in stock badge and triggers onAdd when clicked', async () => {
      const user = userEvent.setup();
      const product = { _id: 'p3', title: 'In Stock Item', price: 499, stock: 10 };
      const onAdd = jest.fn();

      render(
        <MemoryRouter>
          <ProductCard product={product} onAdd={onAdd} />
        </MemoryRouter>
      );

      expect(screen.getByText('In stock')).toBeInTheDocument();
      const addBtn = screen.getByRole('button', { name: 'Add to Cart' });
      expect(addBtn).not.toBeDisabled();

      await user.click(addBtn);
      expect(onAdd).toHaveBeenCalledWith(product);
    });

    it('renders category badge when product has a category', () => {
      const product = { _id: 'p4', title: 'Keyboard', price: 999, stock: 5, category: 'electronics' };
      render(
        <MemoryRouter>
          <ProductCard product={product} onAdd={jest.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByText('electronics')).toHaveClass('category-badge');
    });
  });

  describe('ProductList Component', () => {
    it('shows loading state initially and then renders products', async () => {
      const mockProducts = [
        { _id: 'p1', title: 'Item 1', price: 100, stock: 5 },
        { _id: 'p2', title: 'Item 2', price: 200, stock: 1 }
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProducts)
      });

      render(
        <MemoryRouter>
          <ProductList apiBaseUrl="http://localhost:8080" />
        </MemoryRouter>
      );

      expect(screen.getByText('Loading products...')).toBeInTheDocument();

      expect(await screen.findByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    it('shows empty message when no products returned', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      });

      render(
        <MemoryRouter>
          <ProductList apiBaseUrl="http://localhost:8080" />
        </MemoryRouter>
      );

      expect(await screen.findByText('No products found.')).toBeInTheDocument();
    });

    it('shows error message on fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      render(
        <MemoryRouter>
          <ProductList apiBaseUrl="http://localhost:8080" />
        </MemoryRouter>
      );

      expect(await screen.findByText('Unable to load products.')).toBeInTheDocument();
    });

    it('seeds demo products and reloads page on seed button click', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ message: 'Seeded' })
        });

      render(
        <MemoryRouter>
          <ProductList apiBaseUrl="http://localhost:8080" />
        </MemoryRouter>
      );

      const seedBtn = screen.getByRole('button', { name: 'Seed Demo Products' });
      await user.click(seedBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/products/seed', {
          method: 'POST'
        });
        expect(window.location.reload).toHaveBeenCalled();
      });
    });

    it('adds product to cart from list and displays success message that auto-clears', async () => {
      jest.useFakeTimers();

      const mockProducts = [{ _id: 'p1', title: 'Gadget', price: 300, stock: 5 }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProducts)
      });

      render(
        <MemoryRouter>
          <ProductList apiBaseUrl="http://localhost:8080" />
        </MemoryRouter>
      );

      const addBtn = await screen.findByRole('button', { name: 'Add to Cart' });
      act(() => {
        addBtn.click();
      });

      expect(screen.getByText('Gadget added to cart.')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(screen.queryByText('Gadget added to cart.')).not.toBeInTheDocument();

      jest.useRealTimers();
    });

    it('fetches products with category query when selectedCategory prop is passed', async () => {
      const mockElectronics = [
        { _id: 'e1', title: 'Laptop', price: 60000, stock: 4, category: 'electronics' }
      ];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockElectronics)
      });

      render(
        <MemoryRouter>
          <ProductList apiBaseUrl="http://localhost:8080" selectedCategory="electronics" />
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { level: 1, name: 'Electronics' })).toBeInTheDocument();
      expect(await screen.findByText('Laptop')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/products?category=electronics');
    });

    it('fetches products with category query from URL search param ?category=fashion', async () => {
      const mockFashion = [
        { _id: 'f1', title: 'Jacket', price: 2500, stock: 8, category: 'fashion' }
      ];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockFashion)
      });

      render(
        <MemoryRouter initialEntries={['/?category=fashion']}>
          <ProductList apiBaseUrl="http://localhost:8080" />
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { level: 1, name: 'Fashion' })).toBeInTheDocument();
      expect(await screen.findByText('Jacket')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/products?category=fashion');
    });

    it('fetches products with category query from route param /category/:category', async () => {
      const mockAccessories = [
        { _id: 'a1', title: 'Watch', price: 1500, stock: 12, category: 'accessories' }
      ];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockAccessories)
      });

      render(
        <MemoryRouter initialEntries={['/category/accessories']}>
          <Routes>
            <Route
              path="/category/:category"
              element={<ProductList apiBaseUrl="http://localhost:8080" />}
            />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { level: 1, name: 'Accessories' })).toBeInTheDocument();
      expect(await screen.findByText('Watch')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/products?category=accessories');
    });

    it('handles non-ok API response status and sets error message', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Category not supported' })
      });

      render(
        <MemoryRouter>
          <ProductList apiBaseUrl="http://localhost:8080" selectedCategory="invalid" />
        </MemoryRouter>
      );

      expect(await screen.findByText('Category not supported')).toBeInTheDocument();
    });
  });

  describe('ProductDetails Component', () => {
    it('shows loading state and renders product details on success', async () => {
      const mockProduct = {
        _id: 'p1',
        title: 'Super Phone',
        description: 'Smartphone with great camera',
        price: 999,
        stock: 4
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProduct)
      });

      render(
        <MemoryRouter>
          <ProductDetails apiBaseUrl="http://localhost:8080" productId="p1" />
        </MemoryRouter>
      );

      expect(screen.getByText('Loading product details...')).toBeInTheDocument();

      expect(await screen.findByRole('heading', { level: 1, name: 'Super Phone' })).toBeInTheDocument();
      expect(screen.getByText('Smartphone with great camera')).toBeInTheDocument();
      expect(screen.getByText('₹999')).toBeInTheDocument();
      expect(screen.getByText('In stock')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '← Back to products' })).toHaveAttribute('href', '/');
    });

    it('displays product category in highlights when available', async () => {
      const mockProduct = {
        _id: 'p1',
        title: 'Super Phone',
        description: 'Smartphone with great camera',
        price: 999,
        stock: 4,
        category: 'electronics'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProduct)
      });

      render(
        <MemoryRouter>
          <ProductDetails apiBaseUrl="http://localhost:8080" productId="p1" />
        </MemoryRouter>
      );

      expect(await screen.findByText('Category: Electronics')).toBeInTheDocument();
    });

    it('handles product details fetch error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Product not found in database' })
      });

      render(
        <MemoryRouter>
          <ProductDetails apiBaseUrl="http://localhost:8080" productId="p99" />
        </MemoryRouter>
      );

      expect(await screen.findByText('Product not found in database')).toBeInTheDocument();
    });

    it('handles network failure during details fetch', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection lost'));

      render(
        <MemoryRouter>
          <ProductDetails apiBaseUrl="http://localhost:8080" productId="p99" />
        </MemoryRouter>
      );

      expect(await screen.findByText('Unable to load product details.')).toBeInTheDocument();
    });

    it('allows adding to cart from details page', async () => {
      const user = userEvent.setup();
      const mockProduct = { _id: 'p1', title: 'Watch', price: 200, stock: 2 };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProduct)
      });

      render(
        <MemoryRouter>
          <ProductDetails apiBaseUrl="http://localhost:8080" productId="p1" />
        </MemoryRouter>
      );

      const addBtn = await screen.findByRole('button', { name: 'Add to Cart' });
      await user.click(addBtn);

      expect(screen.getByText('Watch added to cart.')).toBeInTheDocument();
      expect(getCart()[0].productId).toBe('p1');
    });

    it('handles Buy Now action and navigates to /checkout', async () => {
      const user = userEvent.setup();
      const mockProduct = { _id: 'p1', title: 'Camera', price: 1200, stock: 3 };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProduct)
      });

      render(
        <MemoryRouter initialEntries={['/products/p1']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetails apiBaseUrl="http://localhost:8080" productId="p1" />} />
            <Route path="/checkout" element={<div>Checkout Page Mock</div>} />
          </Routes>
        </MemoryRouter>
      );

      const buyNowBtn = await screen.findByRole('button', { name: 'Buy Now' });
      await user.click(buyNowBtn);

      expect(await screen.findByText('Checkout Page Mock')).toBeInTheDocument();
    });

    it('shows Product not found when API returns null or empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(null)
      });

      render(
        <MemoryRouter>
          <ProductDetails apiBaseUrl="http://localhost:8080" productId="missing" />
        </MemoryRouter>
      );

      expect(await screen.findByText('Product not found.')).toBeInTheDocument();
    });

    it('disables Add to Cart and Buy Now when out of stock', async () => {
      const mockProduct = { _id: 'p1', title: 'Out of Stock Tablet', price: 500, stock: 0 };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProduct)
      });

      render(
        <MemoryRouter>
          <ProductDetails apiBaseUrl="http://localhost:8080" productId="p1" />
        </MemoryRouter>
      );

      const addBtn = await screen.findByRole('button', { name: 'Unavailable' });
      const buyBtn = screen.getByRole('button', { name: 'Out of Stock' });

      expect(addBtn).toBeDisabled();
      expect(buyBtn).toBeDisabled();
    });
  });

  describe('App Route Switching', () => {
    it('renders ProductList when on "/" route', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <App apiBaseUrl="http://localhost:8080" />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { level: 1, name: 'Top deals for you' })).toBeInTheDocument();
    });

    it('renders ProductDetails when on "/products/:id" route', async () => {
      const mockProduct = { _id: 'p123', title: 'Keyboard', price: 80, stock: 5 };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProduct)
      });

      render(
        <MemoryRouter initialEntries={['/products/p123']}>
          <Routes>
            <Route path="/products/:id" element={<App apiBaseUrl="http://localhost:8080" />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { level: 1, name: 'Keyboard' })).toBeInTheDocument();
    });
  });
});
