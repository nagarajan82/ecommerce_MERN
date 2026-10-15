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
import ErrorBoundary from '../components/ErrorBoundary';

export function safeLazyRemote(importFn, title = 'Service Unavailable') {
  return React.lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      console.warn(`[frontend-shell] Failed to load remote component: ${title}`, error);
      return {
        default: function RemoteFallback() {
          return (
            <div
              className='error-boundary-fallback page-card'
              role='alert'
              style={{ padding: '24px', textAlign: 'center', margin: '16px auto' }}
            >
              <h2>{title}</h2>
              <p>
                This section is temporarily unavailable or still initializing.
                Please try again in a moment.
              </p>
              <button
                type='button'
                onClick={() => window.location.reload()}
                className='btn btn-secondary'
                style={{ marginTop: '12px' }}
              >
                Reload
              </button>
            </div>
          );
        }
      };
    }
  });
}

const AuthApp = safeLazyRemote(() => import('auth_mfe/App'), 'Authentication Service');
const CatalogApp = safeLazyRemote(() => import('catalog_mfe/App'), 'Product Catalog');
const CheckoutApp = safeLazyRemote(() => import('checkout_mfe/App'), 'Checkout Service');
const OrdersApp = safeLazyRemote(() => import('orders_mfe/App'), 'Orders Service');

window.__API_BASE_URL__ = window.__API_BASE_URL__ || 'http://localhost:8080';
window.__LOG_COLLECTOR_URL__ = window.__LOG_COLLECTOR_URL__ || 'http://localhost:4006';

function getSafeCartCount() {
  try {
    const val = Number(localStorage.getItem('mf_cart_count') || 0);
    return Number.isFinite(val) ? val : 0;
  } catch (_) {
    return 0;
  }
}

export function Header() {
  const [auth, setAuth] = useState(getStoredAuth());
  const [cartCount, setCartCount] = useState(getSafeCartCount());
  const location = useLocation();

  useEffect(() => {
    const syncAuth = () => setAuth(getStoredAuth());
    const syncCart = () => setCartCount(getSafeCartCount());

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
        <Link to='/?category=electronics' className='menubar__link'>
          Electronics
        </Link>
        <Link to='/?category=fashion' className='menubar__link'>
          Fashion
        </Link>
        <Link to='/?category=accessories' className='menubar__link'>
          Accessories
        </Link>
        <Link to='/?category=new-arrivals' className='menubar__link'>
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
      logCollectorUrl: window.__LOG_COLLECTOR_URL__,
    }),
    []
  );

  return (
    <>
      <Header />

      <ShellPage>
        <ErrorBoundary
          appName='frontend-shell'
          title='Unable to load page'
          description='There was a problem loading this section. Please try again.'
        >
          <Suspense fallback={<div className='shell-loader'>Loading...</div>}>
            <Routes>
              <Route path='/' element={<CatalogApp {...remoteProps} />} />
              <Route
                path='/category/:category'
                element={<CatalogApp {...remoteProps} />}
              />
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
        </ErrorBoundary>
      </ShellPage>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary appName='frontend-shell'>
        <AppRouter />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
