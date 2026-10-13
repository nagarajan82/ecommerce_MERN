import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import '../styles/global.css';
import { clearStoredAuth, getStoredAuth } from '../lib/api';

const AuthApp = React.lazy(() => import('auth_mfe/App'));
const CatalogApp = React.lazy(() => import('catalog_mfe/App'));
const CheckoutApp = React.lazy(() => import('checkout_mfe/App'));
const OrdersApp = React.lazy(() => import('orders_mfe/App'));

window.__API_BASE_URL__ = window.__API_BASE_URL__ || 'http://localhost:8080';

export function Header() {
  const [auth, setAuth] = useState(getStoredAuth());
  const [cartCount, setCartCount] = useState(
    Number(localStorage.getItem('mf_cart_count') || 0)
  );
  const location = useLocation();

  useEffect(() => {
    const syncAuth = () => setAuth(getStoredAuth());
    const syncCart = () =>
      setCartCount(Number(localStorage.getItem('mf_cart_count') || 0));

    window.addEventListener('mf-auth-changed', syncAuth);
    window.addEventListener('mf-cart-changed', syncCart);
    window.addEventListener('storage', syncCart);

    return () => {
      window.removeEventListener('mf-auth-changed', syncAuth);
      window.removeEventListener('mf-cart-changed', syncCart);
      window.removeEventListener('storage', syncCart);
    };
  }, []);

  const isAuthPage =
    location.pathname === '/login' || location.pathname === '/signup';

  return (
    <header className='site-header'>
      <div className='topbar'>
        <Link to='/' className='brand'>
          <span className='brand__title'>Shopping Cart</span>
          <span className='brand__subtitle'>Ecommerce Store</span>
        </Link>

        <div className='searchbar'>
          <input
            className='searchbar__input'
            type='text'
            placeholder='Search for products, brands and more'
            readOnly
          />
        </div>

        <nav className='topbar__actions'>
          {!auth?.token ? (
            <>
              <Link to='/login' className='header-btn'>
                Login
              </Link>
              <Link to='/signup' className='header-btn'>
                Sign up
              </Link>
            </>
          ) : (
            <button
              type='button'
              className='header-btn'
              onClick={() => {
                clearStoredAuth();
                localStorage.removeItem('mf_cart');
                localStorage.setItem('mf_cart_count', '0');
                window.dispatchEvent(new Event('mf-auth-changed'));
                window.dispatchEvent(new Event('mf-cart-changed'));
                window.location.href = '/login';
              }}
            >
              Logout
            </button>
          )}

          {!isAuthPage && (
            <>
              <Link to='/orders' className='topbar__link'>
                Orders
              </Link>
              <Link to='/checkout' className='topbar__link topbar__cart'>
                Cart
                <span className='cart-badge'>{cartCount}</span>
              </Link>
            </>
          )}
        </nav>
      </div>

      <div className='menubar'>
        <Link to='/' className='menubar__link'>
          Home
        </Link>
        <Link to='/' className='menubar__link'>
          Electronics
        </Link>
        <Link to='/' className='menubar__link'>
          Fashion
        </Link>
        <Link to='/' className='menubar__link'>
          Accessories
        </Link>
        <Link to='/' className='menubar__link'>
          New Arrivals
        </Link>
      </div>
    </header>
  );
}

export function RequireAuth({ children }) {
  const auth = getStoredAuth();

  if (!auth?.token) {
    return <Navigate to='/login' replace />;
  }

  return children;
}

export function ShellPage({ children }) {
  return (
    <main className='shell-main'>
      <div className='shell-container'>{children}</div>
    </main>
  );
}

export function AppRouter() {
  const remoteProps = useMemo(
    () => ({
      apiBaseUrl: window.__API_BASE_URL__,
    }),
    []
  );

  return (
    <>
      <Header />

      <ShellPage>
        <Suspense fallback={<div className='shell-loader'>Loading...</div>}>
          <Routes>
            <Route path='/' element={<CatalogApp {...remoteProps} />} />
            <Route
              path='/products/:id'
              element={<CatalogApp {...remoteProps} />}
            />
            <Route
              path='/login'
              element={<AuthApp mode='login' {...remoteProps} />}
            />
            <Route
              path='/signup'
              element={<AuthApp mode='signup' {...remoteProps} />}
            />
            <Route
              path='/checkout'
              element={
                <RequireAuth>
                  <CheckoutApp {...remoteProps} />
                </RequireAuth>
              }
            />
            <Route
              path='/orders'
              element={
                <RequireAuth>
                  <OrdersApp {...remoteProps} />
                </RequireAuth>
              }
            />
          </Routes>
        </Suspense>
      </ShellPage>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
