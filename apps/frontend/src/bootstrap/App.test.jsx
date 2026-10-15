import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import App, { Header, RequireAuth, ShellPage, AppRouter } from './App';

describe('Frontend Shell - App and Components', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true
    });
  });

  describe('Header Component', () => {
    it('renders brand title, subtitle, search bar, and menubar categories', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>
      );

      expect(screen.getByText('Shopping Cart')).toBeInTheDocument();
      expect(screen.getByText('Ecommerce Store')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('Search for products, brands and more')
      ).toBeInTheDocument();

      // Menubar links
      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Electronics' })).toHaveAttribute(
        'href',
        '/?category=electronics'
      );
      expect(screen.getByRole('link', { name: 'Fashion' })).toHaveAttribute(
        'href',
        '/?category=fashion'
      );
      expect(screen.getByRole('link', { name: 'Accessories' })).toHaveAttribute(
        'href',
        '/?category=accessories'
      );
      expect(screen.getByRole('link', { name: 'New Arrivals' })).toHaveAttribute(
        'href',
        '/?category=new-arrivals'
      );
    });

    it('shows Login and Sign up buttons when unauthenticated', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    });

    it('shows Orders and Cart links on regular pages with default badge count 0', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
      const cartLink = container.querySelector('.topbar__cart');
      expect(cartLink).toBeInTheDocument();
      expect(cartLink).toHaveTextContent('Cart0');
      expect(screen.getByText('0')).toHaveClass('cart-badge');
    });

    it('hides Orders and Cart links when on /login or /signup', () => {
      const { container, unmount } = render(
        <MemoryRouter initialEntries={['/login']}>
          <Header />
        </MemoryRouter>
      );

      expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
      expect(container.querySelector('.topbar__cart')).toBeNull();
      unmount();

      const { container: signupContainer } = render(
        <MemoryRouter initialEntries={['/signup']}>
          <Header />
        </MemoryRouter>
      );

      expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
      expect(signupContainer.querySelector('.topbar__cart')).toBeNull();
    });

    it('updates cart count when mf-cart-changed or storage event is dispatched', () => {
      localStorage.setItem('mf_cart_count', '3');

      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>
      );

      expect(screen.getByText('3')).toHaveClass('cart-badge');

      // Update in localStorage and dispatch custom event
      act(() => {
        localStorage.setItem('mf_cart_count', '7');
        window.dispatchEvent(new Event('mf-cart-changed'));
      });

      expect(screen.getByText('7')).toHaveClass('cart-badge');

      // Dispatch storage event
      act(() => {
        localStorage.setItem('mf_cart_count', '10');
        window.dispatchEvent(new Event('storage'));
      });

      expect(screen.getByText('10')).toHaveClass('cart-badge');
    });

    it('displays Logout button when user is authenticated and handles logout click', async () => {
      localStorage.setItem(
        'mf_auth',
        JSON.stringify({ token: 'test-token', user: { name: 'John' } })
      );
      localStorage.setItem('mf_cart', JSON.stringify([{ id: 1 }]));
      localStorage.setItem('mf_cart_count', '1');

      let currentHref = 'http://localhost:3000/';
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          origin: 'http://localhost:3000',
          get href() {
            return currentHref;
          },
          set href(val) {
            currentHref = val;
          }
        }
      });

      const authListener = jest.fn();
      const cartListener = jest.fn();
      window.addEventListener('mf-auth-changed', authListener);
      window.addEventListener('mf-cart-changed', cartListener);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>
      );

      const logoutBtn = screen.getByRole('button', { name: 'Logout' });
      expect(logoutBtn).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();

      await userEvent.click(logoutBtn);

      expect(localStorage.getItem('mf_auth')).toBeNull();
      expect(localStorage.getItem('mf_cart')).toBeNull();
      expect(localStorage.getItem('mf_cart_count')).toBe('0');
      expect(authListener).toHaveBeenCalled();
      expect(cartListener).toHaveBeenCalled();
      expect(window.location.href).toBe('/login');

      window.removeEventListener('mf-auth-changed', authListener);
      window.removeEventListener('mf-cart-changed', cartListener);
    });

    it('syncs auth state dynamically when mf-auth-changed event fires', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();

      act(() => {
        localStorage.setItem('mf_auth', JSON.stringify({ token: 'new-token' }));
        window.dispatchEvent(new Event('mf-auth-changed'));
      });

      expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    });
  });

  describe('RequireAuth Component', () => {
    it('redirects unauthenticated users to /login', () => {
      render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route
              path="/protected"
              element={
                <RequireAuth>
                  <div>Secret Content</div>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    it('renders protected children when user is authenticated', () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'auth-jwt-token' }));

      render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route
              path="/protected"
              element={
                <RequireAuth>
                  <div>Secret Content</div>
                </RequireAuth>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Secret Content')).toBeInTheDocument();
    });
  });

  describe('ShellPage Component', () => {
    it('renders main layout container wrapping child nodes', () => {
      render(
        <ShellPage>
          <div data-testid="child-element">Hello Shell</div>
        </ShellPage>
      );

      const main = screen.getByRole('main');
      expect(main).toHaveClass('shell-main');
      expect(screen.getByTestId('child-element')).toBeInTheDocument();
    });
  });

  describe('AppRouter Routing and Remote Microfrontends', () => {
    it('renders CatalogApp remote at root route /', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <AppRouter />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('mock-catalog-mfe')).toBeInTheDocument();
    });

    it('renders CatalogApp remote at /products/:id', async () => {
      render(
        <MemoryRouter initialEntries={['/products/101']}>
          <AppRouter />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('mock-catalog-mfe')).toBeInTheDocument();
    });

    it('renders CatalogApp remote at /category/:category', async () => {
      render(
        <MemoryRouter initialEntries={['/category/electronics']}>
          <AppRouter />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('mock-catalog-mfe')).toBeInTheDocument();
    });

    it('renders AuthApp remote with mode=login at /login', async () => {
      render(
        <MemoryRouter initialEntries={['/login']}>
          <AppRouter />
        </MemoryRouter>
      );

      const authMfe = await screen.findByTestId('mock-auth-mfe');
      expect(authMfe).toBeInTheDocument();
      expect(authMfe).toHaveAttribute('data-mode', 'login');
    });

    it('renders AuthApp remote with mode=signup at /signup', async () => {
      render(
        <MemoryRouter initialEntries={['/signup']}>
          <AppRouter />
        </MemoryRouter>
      );

      const authMfe = await screen.findByTestId('mock-auth-mfe');
      expect(authMfe).toBeInTheDocument();
      expect(authMfe).toHaveAttribute('data-mode', 'signup');
    });

    it('redirects /checkout to /login when user is not authenticated', async () => {
      render(
        <MemoryRouter initialEntries={['/checkout']}>
          <AppRouter />
        </MemoryRouter>
      );

      // Should redirect to /login and render AuthApp in login mode
      const authMfe = await screen.findByTestId('mock-auth-mfe');
      expect(authMfe).toBeInTheDocument();
      expect(authMfe).toHaveAttribute('data-mode', 'login');
      expect(screen.queryByTestId('mock-checkout-mfe')).not.toBeInTheDocument();
    });

    it('renders CheckoutApp remote at /checkout when authenticated', async () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'active-token' }));

      render(
        <MemoryRouter initialEntries={['/checkout']}>
          <AppRouter />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('mock-checkout-mfe')).toBeInTheDocument();
    });

    it('redirects /orders to /login when user is not authenticated', async () => {
      render(
        <MemoryRouter initialEntries={['/orders']}>
          <AppRouter />
        </MemoryRouter>
      );

      const authMfe = await screen.findByTestId('mock-auth-mfe');
      expect(authMfe).toBeInTheDocument();
      expect(authMfe).toHaveAttribute('data-mode', 'login');
      expect(screen.queryByTestId('mock-orders-mfe')).not.toBeInTheDocument();
    });

    it('renders OrdersApp remote at /orders when authenticated', async () => {
      localStorage.setItem('mf_auth', JSON.stringify({ token: 'active-token' }));

      render(
        <MemoryRouter initialEntries={['/orders']}>
          <AppRouter />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('mock-orders-mfe')).toBeInTheDocument();
    });
  });

  describe('Default App Integration', () => {
    it('mounts without crashing and displays header and catalog content', async () => {
      render(<App />);

      expect(screen.getByText('Shopping Cart')).toBeInTheDocument();
      expect(await screen.findByTestId('mock-catalog-mfe')).toBeInTheDocument();
    });
  });
});
