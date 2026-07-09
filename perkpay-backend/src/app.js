require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shops');
const offerRoutes = require('./routes/offers');
const paymentRoutes = require('./routes/payments');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'PerkPay API' }));

app.use('/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`PerkPay API running on port ${PORT}`));

module.exports = app;
