const {
  listProducts,
  getProduct,
  createProduct,
  seedProducts,
  getProductsByIds,
} = require('../../src/controllers/productController');
const Product = require('../../src/models/Product');

jest.mock('../../src/models/Product');

describe('Product Service - Product Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, body: {}, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('listProducts', () => {
    it('should return products sorted by createdAt descending', async () => {
      const mockProducts = [{ _id: 'p1', name: 'Product 1' }];
      const sortMock = jest.fn().mockResolvedValue(mockProducts);
      Product.find.mockReturnValue({ sort: sortMock });

      await listProducts(req, res);

      expect(Product.find).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(res.json).toHaveBeenCalledWith(mockProducts);
    });

    it('should filter products by category case-insensitively', async () => {
      req.query = { category: 'electronics' };
      const mockProducts = [{ _id: 'p1', name: 'Keyboard', category: 'electronics' }];
      const sortMock = jest.fn().mockResolvedValue(mockProducts);
      Product.find.mockReturnValue({ sort: sortMock });

      await listProducts(req, res);

      expect(Product.find).toHaveBeenCalledWith({
        category: { $regex: /^electronics$/i },
      });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(res.json).toHaveBeenCalledWith(mockProducts);
    });

    it('should filter products for new-arrivals combining isNewArrival and category regex', async () => {
      req.query = { category: 'new-arrivals' };
      const mockProducts = [{ _id: 'p1', name: 'Smart Watch', isNewArrival: true }];
      const sortMock = jest.fn().mockResolvedValue(mockProducts);
      Product.find.mockReturnValue({ sort: sortMock });

      await listProducts(req, res);

      expect(Product.find).toHaveBeenCalledWith({
        $or: [
          { isNewArrival: true },
          { category: { $regex: /^new[- ]?arrivals?$/i } },
        ],
      });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(res.json).toHaveBeenCalledWith(mockProducts);
    });

    it('should return all products when category query is empty or whitespace', async () => {
      req.query = { category: '   ' };
      const mockProducts = [{ _id: 'p1', name: 'Item' }];
      const sortMock = jest.fn().mockResolvedValue(mockProducts);
      Product.find.mockReturnValue({ sort: sortMock });

      await listProducts(req, res);

      expect(Product.find).toHaveBeenCalledWith({});
      expect(res.json).toHaveBeenCalledWith(mockProducts);
    });

    it('should reject with 400 when category filter exceeds 50 characters', async () => {
      req.query = { category: 'a'.repeat(51) };

      await listProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid category filter' });
      expect(Product.find).not.toHaveBeenCalled();
    });

    it('should return 500 on database failure', async () => {
      Product.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('DB failure')),
      });

      await listProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB failure' });
    });
  });

  describe('getProduct', () => {
    it('should return 404 when product is not found', async () => {
      req.params.id = 'p-nonexistent';
      Product.findById.mockResolvedValue(null);

      await getProduct(req, res);

      expect(Product.findById).toHaveBeenCalledWith('p-nonexistent');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Product not found' });
    });

    it('should return product details when found', async () => {
      req.params.id = 'p1';
      const mockProduct = { _id: 'p1', name: 'Keyboard', price: 100 };
      Product.findById.mockResolvedValue(mockProduct);

      await getProduct(req, res);

      expect(res.json).toHaveBeenCalledWith(mockProduct);
    });

    it('should return 500 on unexpected lookup error', async () => {
      req.params.id = 'p1';
      Product.findById.mockRejectedValue(new Error('CastError'));

      await getProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'CastError' });
    });
  });

  describe('createProduct', () => {
    it('should create product and return 201 on valid input', async () => {
      req.body = {
        name: 'Headphones',
        description: 'Wireless',
        price: 5000,
        stock: 10,
        image: 'img.png',
        category: 'electronics',
        sku: 'ELEC-HP-001',
      };
      const created = { _id: 'p1', ...req.body };
      Product.create.mockResolvedValue(created);

      await createProduct(req, res);

      expect(Product.create).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('should create product with isNewArrival flag', async () => {
      req.body = {
        name: 'Headphones',
        price: 5000,
        stock: 10,
        sku: 'ELEC-HP-002',
        isNewArrival: true,
      };
      const created = { _id: 'p2', ...req.body };
      Product.create.mockResolvedValue(created);

      await createProduct(req, res);

      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({ isNewArrival: true })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('should return 400 when validation fails on create', async () => {
      req.body = { name: '' };
      Product.create.mockRejectedValue(new Error('Validation error: price is required'));

      await createProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Validation error: price is required' });
    });
  });

  describe('seedProducts', () => {
    it('should bulkWrite seed products and return summary stats', async () => {
      Product.bulkWrite.mockResolvedValue({
        matchedCount: 5,
        modifiedCount: 2,
        upsertedCount: 15,
      });
      const allProducts = new Array(20).fill({ name: 'Item' });
      Product.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(allProducts),
      });

      await seedProducts(req, res);

      expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Seed completed successfully',
        matchedCount: 5,
        modifiedCount: 2,
        insertedCount: 15,
        total: 20,
        products: allProducts,
      });
    });

    it('should handle zero stats defaults and return 500 on error', async () => {
      Product.bulkWrite.mockResolvedValue({});
      Product.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      });

      await seedProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          matchedCount: 0,
          modifiedCount: 0,
          insertedCount: 0,
          total: 0,
        })
      );

      // Test error branch
      Product.bulkWrite.mockRejectedValue(new Error('Seed failed'));
      await seedProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Seed failed' });
    });
  });

  describe('getProductsByIds', () => {
    it('should parse comma-separated ids and return matching products', async () => {
      req.query.ids = 'p1, p2 , p3';
      const mockResult = [{ _id: 'p1' }, { _id: 'p2' }];
      Product.find.mockResolvedValue(mockResult);

      await getProductsByIds(req, res);

      expect(Product.find).toHaveBeenCalledWith({ _id: { $in: ['p1', 'p2', 'p3'] } });
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should handle empty or omitted query.ids gracefully', async () => {
      req.query = {};
      Product.find.mockResolvedValue([]);

      await getProductsByIds(req, res);

      expect(Product.find).toHaveBeenCalledWith({ _id: { $in: [] } });
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('should return 500 on database failure', async () => {
      req.query.ids = 'p1';
      Product.find.mockRejectedValue(new Error('Batch query failure'));

      await getProductsByIds(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Batch query failure' });
    });
  });
});
