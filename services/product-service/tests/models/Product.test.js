const Product = require('../../src/models/Product');

describe('Product Service - Product Model Validation', () => {
  it('should validate a complete valid product document', () => {
    const product = new Product({
      name: 'Mechanical Keyboard',
      description: 'Tactile switch keyboard',
      price: 5499,
      image: 'https://example.com/keyboard.jpg',
      category: 'electronics',
      stock: 20,
      sku: 'ELEC-KEY-002',
    });

    const err = product.validateSync();
    expect(err).toBeUndefined();
    expect(product.category).toBe('electronics');
    expect(product.stock).toBe(20);
  });

  it('should require name, price, stock, and sku', () => {
    const product = new Product({});
    const err = product.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.name).toBeDefined();
    expect(err.errors.price).toBeDefined();
    expect(err.errors.sku).toBeDefined();
  });

  it('should default description, image, and category when omitted', () => {
    const product = new Product({
      name: 'Wireless Mouse',
      price: 1999,
      stock: 10,
      sku: 'ELEC-MOUSE-001',
    });
    expect(product.description).toBe('');
    expect(product.image).toBe('');
    expect(product.category).toBe('general');
    expect(product.isNewArrival).toBe(false);
  });

  it('should trim and lowercase category and accept explicit isNewArrival', () => {
    const product = new Product({
      name: 'Wireless Mouse',
      price: 1999,
      stock: 10,
      sku: 'ELEC-MOUSE-001',
      category: ' Electronics ',
      isNewArrival: true,
    });
    expect(product.category).toBe('electronics');
    expect(product.isNewArrival).toBe(true);
  });

  it('should reject negative stock values', () => {
    const product = new Product({
      name: 'Test Item',
      price: 500,
      stock: -5,
      sku: 'TEST-SKU-001',
    });
    const err = product.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.stock).toBeDefined();
  });
});
