import React, { useMemo, useState } from 'react';
import '../styles/auth.css';
import ErrorBoundary from '../components/ErrorBoundary';

export function setStoredAuth(data) {
  localStorage.setItem('mf_auth', JSON.stringify(data));
  window.dispatchEvent(new Event('mf-auth-changed'));
}

export default function App({ apiBaseUrl, mode = 'login' }) {
  const isLogin = mode === 'login';

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const copy = useMemo(() => {
    if (isLogin) {
      return {
        title: 'Login',
        subtitle: 'Access your account to continue shopping.',
        endpoint: '/api/auth/login',
      };
    }

    return {
      title: 'Create account',
      subtitle: 'Join and start your ecommerce experience.',
      endpoint: '/api/auth/register',
    };
  }, [isLogin]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setSuccess('');
    setSubmitting(true);

    try {
      const payload = isLogin
        ? {
            email: form.email,
            password: form.password,
          }
        : form;

      const response = await fetch(`${apiBaseUrl}${copy.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.message || 'Something went wrong.');
        return;
      }

      setStoredAuth(data);
      setSuccess(isLogin ? 'Login successful.' : 'Registration successful.');

      window.setTimeout(() => window.location.assign('/'), 1200);
    } catch (error) {
      setMessage('Unable to complete request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ErrorBoundary appName='auth-mfe'>
      <section className='auth-page'>
        <div className='auth-card'>
          <div className='auth-card__left'>
            <h1 className='auth-card__title'>{copy.title}</h1>
            <p className='auth-card__subtitle'>{copy.subtitle}</p>
          </div>

          <div className='auth-card__right'>
            <form className='auth-form' onSubmit={handleSubmit}>
              {!isLogin ? (
                <input
                  className='auth-input'
                  type='text'
                  placeholder='Enter your name'
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                />
              ) : null}

              <input
                className='auth-input'
                type='email'
                placeholder='Enter email'
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                required
              />

              <input
                className='auth-input'
                type='password'
                placeholder='Enter password'
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                required
              />

              {message ? (
                <div className='message message-error'>{message}</div>
              ) : null}
              {success ? (
                <div className='message message-success'>{success}</div>
              ) : null}

              <button
                type='submit'
                className='btn btn-secondary auth-submit'
                disabled={submitting}
              >
                {submitting ? 'Please wait...' : copy.title}
              </button>

              <p className='auth-form__switch'>
                {isLogin ? 'New to the store?' : 'Already have an account?'}{' '}
                <a href={isLogin ? '/signup' : '/login'}>
                  {isLogin ? 'Create an account' : 'Log in'}
                </a>
              </p>
            </form>
          </div>
        </div>
      </section>
    </ErrorBoundary>
  );
}
