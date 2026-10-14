import React, { useEffect, useState } from 'react';
import '../styles/orders.css';
import ErrorBoundary from '../components/ErrorBoundary';

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem('mf_auth');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export default function App({ apiBaseUrl }) {
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const auth = getStoredAuth();

    if (!auth?.token) {
      setMessage('Please login to view orders.');
      return undefined;
    }

    let active = true;

    async function loadOrders() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/orders`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        });

        const data = await response.json();

        if (!active) return;

        if (!response.ok) {
          setMessage(data?.message || 'Unable to load orders.');
          return;
        }

        setOrders(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!active) return;
        setMessage('Unable to load orders.');
      }
    }

    loadOrders();
    const intervalId = setInterval(loadOrders, 3000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [apiBaseUrl]);

  return (
    <ErrorBoundary appName='orders-mfe'>
      <section className='orders-page'>
      <div className='page-card'>
        <h1 className='page-title'>Your Orders</h1>
        <p className='page-subtitle'>
          This page auto-refreshes so you can see the async payment flow
          updates.
        </p>

        {message ? (
          <div className='message message-error'>{message}</div>
        ) : null}

        {!orders.length ? (
          <p>No orders found yet.</p>
        ) : (
          <div className='orders-list'>
            {orders.map((order) => (
              <article key={order._id} className='order-card'>
                <div className='order-card__top'>
                  <div>
                    <div className='order-card__id'>
                      Order #{order._id.slice(-8)}
                    </div>
                    <div className='order-card__status'>
                      Status: {order.status}
                    </div>
                  </div>
                  <div className='order-card__total'>₹{order.totalAmount}</div>
                </div>

                <div className='order-card__items'>
                  {(order.items || []).map((item, index) => (
                    <div
                      key={`${item.productId}-${index}`}
                      className='order-card__item'
                    >
                      <span>{item.name}</span>
                      <span>
                        {item.quantity} × ₹{item.price}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  </ErrorBoundary>
  );
}
