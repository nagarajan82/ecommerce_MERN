const Product = require('../models/Product');

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listProducts(req, res) {
  try {
    const categoryParam = req.query?.category;
    let query = {};

    if (categoryParam !== undefined && categoryParam !== null) {
      const category = String(categoryParam).trim();
      if (category.length > 50) {
        return res.status(400).json({ message: 'Invalid category filter' });
      }

      if (category) {
        const lowerCategory = category.toLowerCase();
        if (
          lowerCategory === 'new-arrivals' ||
          lowerCategory === 'new-arrival' ||
          lowerCategory === 'new arrivals' ||
          lowerCategory === 'new arrival'
        ) {
          query = {
            $or: [
              { isNewArrival: true },
              { category: { $regex: /^new[- ]?arrivals?$/i } },
            ],
          };
        } else {
          query = {
            category: { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') },
          };
        }
      }
    }

    const products = await Product.find(query).sort({ createdAt: -1 });
    return res.json(products);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getProduct(req, res) {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    return res.json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createProduct(req, res) {
  try {
    const { name, description, price, stock, image, category, sku, isNewArrival } = req.body;

    const payload = {
      name,
      description,
      price,
      stock,
      image,
      category,
      sku,
    };

    if (isNewArrival !== undefined) {
      payload.isNewArrival = Boolean(isNewArrival);
    }

    const product = await Product.create(payload);

    return res.status(201).json(product);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function seedProducts(req, res) {
  try {
    const products = [
      {
        name: 'Noise-Cancelling Headphones',
        description:
          'Wireless over-ear headphones with 30-hour battery life and immersive sound.',
        price: 7999,
        image:
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&auto=format&fit=crop&q=80',
        category: 'electronics',
        isNewArrival: false,
        stock: 12,
        sku: 'ELEC-HEAD-001',
      },
      {
        name: 'Mechanical Keyboard',
        description:
          'Hot-swappable mechanical keyboard with tactile switches and compact layout.',
        price: 5499,
        image:
          'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=1200&auto=format&fit=crop&q=80',
        category: 'electronics',
        isNewArrival: false,
        stock: 20,
        sku: 'ELEC-KEY-002',
      },
      {
        name: 'Running Shoes',
        description:
          'Lightweight performance shoes designed for daily runs and all-day comfort.',
        price: 3299,
        image:
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&auto=format&fit=crop&q=80',
        category: 'fashion',
        isNewArrival: true,
        stock: 18,
        sku: 'FASH-SHOE-003',
      },
      {
        name: 'Smart Watch',
        description:
          'Fitness tracking, heart-rate monitoring, sleep analysis, and notifications.',
        price: 8999,
        image:
          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&auto=format&fit=crop&q=80',
        category: 'accessories',
        isNewArrival: true,
        stock: 9,
        sku: 'WEAR-WATCH-004',
      },
      {
        name: 'Gaming Mouse',
        description:
          'Ergonomic gaming mouse with customizable DPI and programmable buttons.',
        price: 2999,
        image:
          'https://images.unsplash.com/photo-1527814050087-3793815479db?w=1200&auto=format&fit=crop&q=80',
        category: 'electronics',
        isNewArrival: false,
        stock: 25,
        sku: 'ELEC-MOUSE-005',
      },
      {
        name: 'Bluetooth Speaker',
        description:
          'Portable speaker with punchy bass, Bluetooth 5.0, and 12-hour playback.',
        price: 4599,
        image:
          'https://images.unsplash.com/photo-1589003077984-894e133dabab?w=1200&auto=format&fit=crop&q=80',
        category: 'electronics',
        isNewArrival: false,
        stock: 15,
        sku: 'ELEC-SPKR-006',
      },
      {
        name: 'Yoga Mat',
        description:
          'Non-slip eco-friendly yoga mat designed for stretching, yoga, and floor workouts.',
        price: 1299,
        image:
          'https://images.unsplash.com/photo-1599447421416-3414500d18a5?w=1200&auto=format&fit=crop&q=80',
        category: 'accessories',
        isNewArrival: false,
        stock: 30,
        sku: 'FIT-MAT-007',
      },
      {
        name: 'Adjustable Dumbbell Set',
        description:
          'Compact adjustable dumbbells ideal for home strength training routines.',
        price: 4999,
        image:
          'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=1200&auto=format&fit=crop&q=80',
        category: 'accessories',
        isNewArrival: false,
        stock: 10,
        sku: 'FIT-DUMB-008',
      },
      {
        name: 'Travel Backpack',
        description:
          'Water-resistant backpack with multiple compartments for travel and office use.',
        price: 1999,
        image:
          'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&auto=format&fit=crop&q=80',
        category: 'fashion',
        isNewArrival: false,
        stock: 22,
        sku: 'FASH-BAG-009',
      },
      {
        name: 'Polarized Sunglasses',
        description:
          'UV-protected stylish sunglasses for travel, driving, and outdoor use.',
        price: 1499,
        image:
          'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=1200&auto=format&fit=crop&q=80',
        category: 'accessories',
        isNewArrival: false,
        stock: 40,
        sku: 'FASH-SUN-010',
      },
      {
        name: 'Wireless Earbuds',
        description:
          'Compact earbuds with noise isolation, touch controls, and charging case.',
        price: 3999,
        image:
          'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=1200&auto=format&fit=crop&q=80',
        category: 'electronics',
        isNewArrival: true,
        stock: 18,
        sku: 'ELEC-EARB-011',
      },
      {
        name: 'Laptop Stand',
        description:
          'Adjustable aluminum laptop stand for better posture and airflow.',
        price: 2599,
        image:
          'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=1200&auto=format&fit=crop&q=80',
        category: 'accessories',
        isNewArrival: false,
        stock: 12,
        sku: 'ELEC-STND-012',
      },
      {
        name: 'Coffee Maker',
        description:
          'Automatic drip coffee maker with timer and programmable brew settings.',
        price: 6999,
        image:
          'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&auto=format&fit=crop&q=80',
        category: 'home-appliances',
        isNewArrival: false,
        stock: 8,
        sku: 'HOME-COFF-013',
      },
      {
        name: 'Air Purifier',
        description:
          'HEPA-based air purifier designed for cleaner indoor air and allergy control.',
        price: 12999,
        image:
          'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1200&auto=format&fit=crop&q=80',
        category: 'home-appliances',
        isNewArrival: false,
        stock: 5,
        sku: 'HOME-AIR-014',
      },
      {
        name: 'Electric Kettle',
        description:
          'Fast-boiling electric kettle with auto shut-off and stainless steel body.',
        price: 1999,
        image:
          'https://images.unsplash.com/photo-1517705008128-361805f42e86?w=1200&auto=format&fit=crop&q=80',
        category: 'home-appliances',
        isNewArrival: false,
        stock: 20,
        sku: 'HOME-KETT-015',
      },
      {
        name: 'Smartphone',
        description:
          'High-performance smartphone with premium camera system and OLED display.',
        price: 49999,
        image:
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&auto=format&fit=crop&q=80',
        category: 'electronics',
        isNewArrival: true,
        stock: 10,
        sku: 'ELEC-PHONE-016',
      },
      {
        name: 'Tablet',
        description:
          'Slim and lightweight tablet with 10-inch display for work and streaming.',
        price: 29999,
        image:
          'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=1200&auto=format&fit=crop&q=80',
        category: 'electronics',
        isNewArrival: false,
        stock: 7,
        sku: 'ELEC-TAB-017',
      },
      {
        name: 'Office Chair',
        description:
          'Ergonomic office chair with lumbar support and adjustable height.',
        price: 8999,
        image:
          'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?w=1200&auto=format&fit=crop&q=80',
        category: 'furniture',
        isNewArrival: false,
        stock: 6,
        sku: 'FURN-CHAIR-018',
      },
      {
        name: 'Desk Lamp',
        description:
          'LED desk lamp with adjustable brightness and minimal modern design.',
        price: 1599,
        image:
          'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=1200&auto=format&fit=crop&q=80',
        category: 'accessories',
        isNewArrival: false,
        stock: 25,
        sku: 'HOME-LAMP-019',
      },
      {
        name: 'Wall Clock',
        description: 'Modern silent wall clock for home and office interiors.',
        price: 999,
        image:
          'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=1200&auto=format&fit=crop&q=80',
        category: 'accessories',
        isNewArrival: false,
        stock: 30,
        sku: 'HOME-CLOCK-020',
      },
    ];

    const ops = products.map((product) => ({
      updateOne: {
        filter: { sku: product.sku },
        update: { $set: product },
        upsert: true,
      },
    }));

    const result = await Product.bulkWrite(ops, { ordered: false });
    const allProducts = await Product.find().sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Seed completed successfully',
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      insertedCount: result.upsertedCount || 0,
      total: allProducts.length,
      products: allProducts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getProductsByIds(req, res) {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const products = await Product.find({ _id: { $in: ids } });
    return res.json(products);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  seedProducts,
  getProductsByIds,
};
