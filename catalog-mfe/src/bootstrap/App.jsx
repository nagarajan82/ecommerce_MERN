import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import '../styles/catalog.css';

export function getProductTitle(product) {
  return product?.title || product?.name || 'Product';
}

export function getProductDescription(product) {
  return product?.description || 'No description available.';
}

export function getProductImage(product) {
  return product?.image || 'https://via.placeholder.com/280x280?text=Product';
}

export function getCart() {
  const raw = localStorage.getItem('mf_cart');
  return raw ? JSON.parse(raw) : [];
}

export function setCart(cart) {
  localStorage.setItem('mf_cart', JSON.stringify(cart));
  localStorage.setItem(
    'mf_cart_count',
    String(cart.reduce((sum, item) => sum + item.quantity, 0))
  );
  window.dispatchEvent(new Event('mf-cart-changed'));
}

export function addToCart(product) {
  const productTitle = getProductTitle(product);

  if (!product?.stock || product.stock <= 0) {
    return { ok: false, message: `${productTitle} is out of stock.` };
  }

  const cart = getCart();
  const existing = cart.find((item) => item.productId === product._id);
  const existingQty = existing ? existing.quantity : 0;

  if (existingQty + 1 > product.stock) {
    return {
      ok: false,
      message: `Only ${product.stock} item(s) available for ${productTitle}.`,
    };
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      productId: product._id,
      name: productTitle,
      description: getProductDescription(product),
      image: getProductImage(product),
      price: product.price,
      quantity: 1,
    });
  }

  setCart(cart);
  return { ok: true, message: `${productTitle} added to cart.` };
}

export function ProductCard({ product, onAdd }) {
  const isOutOfStock = !product.stock || product.stock <= 0;
  const productTitle = getProductTitle(product);
  const productDescription = getProductDescription(product);

  return (
    <article className='catalog-card'>
      <Link
        className='catalog-card__image-wrap'
        to={`/products/${product._id}`}
      >
        <img
          className='catalog-card__image'
          src={getProductImage(product)}
          alt={productTitle}
        />
      </Link>

      <div className='catalog-card__body'>
        <Link to={`/products/${product._id}`} className='catalog-card__title'>
          {productTitle}
        </Link>

        <p className='catalog-card__desc'>{productDescription}</p>

        <div className='catalog-card__price'>₹{product.price}</div>

        <div className='catalog-card__meta'>
          {isOutOfStock ? (
            <span className='stock-badge stock-badge--out'>Out of stock</span>
          ) : product.stock <= 3 ? (
            <span className='stock-badge stock-badge--low'>
              Only {product.stock} left
            </span>
          ) : (
            <span className='stock-badge stock-badge--in'>In stock</span>
          )}
        </div>

        <div className='catalog-card__actions'>
          <button
            type='button'
            className='btn btn-secondary'
            onClick={() => onAdd(product)}
            disabled={isOutOfStock}
          >
            {isOutOfStock ? 'Unavailable' : 'Add to Cart'}
          </button>

          <Link
            to={`/products/${product._id}`}
            className='btn btn-outline catalog-card__details-btn'
          >
            View Details
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ProductList({ apiBaseUrl }) {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        setLoading(true);
        const response = await fetch(`${apiBaseUrl}/api/products`);
        const data = await response.json();

        if (!active) return;
        setProducts(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!active) return;
        setMessage('Unable to load products.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  function handleAdd(product) {
    const result = addToCart(product);
    setMessage(result.message || '');

    if (result.ok) {
      setTimeout(() => setMessage(''), 1800);
    }
  }

  const hasProducts = products.length > 0;

  return (
    <div className='catalog-page'>
      <section className='catalog-hero page-card'>
        <div>
          <h1 className='page-title'>Top deals for you</h1>
          <p className='page-subtitle'>
            Explore a cleaner ecommerce UI with product grid, details page and
            cart flow.
          </p>
        </div>

        <button
          type='button'
          className='btn btn-outline'
          onClick={async () => {
            await fetch(`${apiBaseUrl}/api/products/seed`, { method: 'POST' });
            window.location.reload();
          }}
        >
          Seed Demo Products
        </button>
      </section>

      {message ? (
        <div
          className={`message ${
            message.toLowerCase().includes('added')
              ? 'message-success'
              : 'message-error'
          }`}
        >
          {message}
        </div>
      ) : null}

      {loading ? <div className='page-card'>Loading products...</div> : null}

      {!loading && !hasProducts ? (
        <div className='page-card'>
          <p>No products found.</p>
        </div>
      ) : null}

      {!loading && hasProducts ? (
        <section className='catalog-grid'>
          {products.map((product) => (
            <ProductCard
              key={product._id}
              product={product}
              onAdd={handleAdd}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function ProductDetails({ apiBaseUrl, productId }) {
  const [product, setProduct] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function loadProduct() {
      try {
        setLoading(true);
        const response = await fetch(`${apiBaseUrl}/api/products/${productId}`);
        const data = await response.json();

        if (!active) return;

        if (!response.ok) {
          setMessage(data?.message || 'Unable to load product details.');
          return;
        }

        setProduct(data);
      } catch (error) {
        if (!active) return;
        setMessage('Unable to load product details.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (productId) {
      loadProduct();
    }

    return () => {
      active = false;
    };
  }, [apiBaseUrl, productId]);

  if (loading) {
    return <div className='page-card'>Loading product details...</div>;
  }

  if (message && !product) {
    return <div className='message message-error'>{message}</div>;
  }

  if (!product) {
    return <div className='page-card'>Product not found.</div>;
  }

  const isOutOfStock = !product.stock || product.stock <= 0;
  const productTitle = getProductTitle(product);

  function handleAdd() {
    const result = addToCart(product);
    setMessage(result.message || '');
  }

  function handleBuyNow() {
    const result = addToCart(product);
    if (!result.ok) {
      setMessage(result.message || '');
      return;
    }
    navigate('/checkout');
  }

  return (
    <section className='product-details page-card'>
      <div className='product-details__gallery'>
        <img
          className='product-details__image'
          src={getProductImage(product)}
          alt={productTitle}
        />

        <div className='product-details__gallery-actions'>
          <button
            type='button'
            className='btn btn-secondary'
            onClick={handleAdd}
            disabled={isOutOfStock}
          >
            {isOutOfStock ? 'Unavailable' : 'Add to Cart'}
          </button>

          <button
            type='button'
            className='btn btn-primary'
            onClick={handleBuyNow}
            disabled={isOutOfStock}
          >
            {isOutOfStock ? 'Out of Stock' : 'Buy Now'}
          </button>
        </div>
      </div>

      <div className='product-details__content'>
        <h1 className='product-details__title'>{productTitle}</h1>
        <div className='product-details__price'>₹{product.price}</div>

        <div className='product-details__stock-wrap'>
          {isOutOfStock ? (
            <span className='stock-badge stock-badge--out'>Out of stock</span>
          ) : product.stock <= 3 ? (
            <span className='stock-badge stock-badge--low'>
              Only {product.stock} left
            </span>
          ) : (
            <span className='stock-badge stock-badge--in'>In stock</span>
          )}
        </div>

        <p className='product-details__description'>
          {getProductDescription(product)}
        </p>

        {message ? (
          <div
            className={`message ${
              message.toLowerCase().includes('added')
                ? 'message-success'
                : 'message-error'
            }`}
          >
            {message}
          </div>
        ) : null}

        <ul className='product-details__highlights'>
          <li>Secure checkout experience</li>
          <li>Fast async payment simulation</li>
          <li>Microfrontend product details route</li>
        </ul>

        <Link to='/' className='product-details__back-link'>
          ← Back to products
        </Link>
      </div>
    </section>
  );
}

export default function App({ apiBaseUrl }) {
  const location = useLocation();
  const params = useParams();

  const isDetailsPage = useMemo(
    () => location.pathname.startsWith('/products/'),
    [location.pathname]
  );

  if (isDetailsPage) {
    return <ProductDetails apiBaseUrl={apiBaseUrl} productId={params.id} />;
  }

  return <ProductList apiBaseUrl={apiBaseUrl} />;
}
