const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    image: { type: String, default: '' },
    category: { type: String, default: 'general', trim: true, lowercase: true },
    isNewArrival: { type: Boolean, default: false },
    stock: { type: Number, required: true, min: 0, default: 0 },
    sku: { type: String, unique: true, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
