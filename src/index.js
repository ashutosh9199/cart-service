const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/cartdb';
mongoose.connect(MONGO_URI).then(() => console.log('Cart Service: MongoDB connected')).catch(err => console.error(err));

const PRODUCT_SERVICE = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3003';

const cartItemSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  productId: { type: String, required: true },
  name: String,
  image: String,
  price: Number,
  quantity: { type: Number, default: 1 },
  size: String,
  color: String,
  addedAt: { type: Date, default: Date.now }
});
cartItemSchema.index({ userId: 1, productId: 1 }, { unique: true });
const CartItem = mongoose.model('CartItem', cartItemSchema);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'cart-service' }));

// Get cart
app.get('/cart/:userId', async (req, res) => {
  try {
    const items = await CartItem.find({ userId: req.params.userId }).sort({ addedAt: -1 });
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    res.json({ items, total: Math.round(total * 100) / 100, count: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add to cart
app.post('/cart', async (req, res) => {
  try {
    const { userId, productId, quantity = 1, size, color } = req.body;
    // Fetch product details
    let productData = {};
    try {
      const resp = await axios.get(`${PRODUCT_SERVICE}/products/${productId}`);
      productData = resp.data;
    } catch (e) { /* use provided data */ }

    const existing = await CartItem.findOne({ userId, productId });
    if (existing) {
      existing.quantity += quantity;
      await existing.save();
      return res.json({ message: 'Cart updated', item: existing });
    }

    const item = await CartItem.create({
      userId, productId, quantity, size, color,
      name: productData.name || req.body.name,
      image: (productData.images && productData.images[0]) || req.body.image,
      price: productData.price || req.body.price
    });
    res.status(201).json({ message: 'Added to cart', item });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update quantity
app.put('/cart', async (req, res) => {
  try {
    const { userId, productId, quantity } = req.body;
    if (quantity <= 0) {
      await CartItem.findOneAndDelete({ userId, productId });
      return res.json({ message: 'Item removed from cart' });
    }
    const item = await CartItem.findOneAndUpdate({ userId, productId }, { quantity }, { new: true });
    res.json({ message: 'Cart updated', item });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove from cart
app.delete('/cart/:userId/:productId', async (req, res) => {
  try {
    await CartItem.findOneAndDelete({ userId: req.params.userId, productId: req.params.productId });
    res.json({ message: 'Item removed from cart' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear cart
app.delete('/cart/:userId', async (req, res) => {
  try {
    await CartItem.deleteMany({ userId: req.params.userId });
    res.json({ message: 'Cart cleared' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => console.log(`Cart Service running on port ${PORT}`));
