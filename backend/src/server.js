const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const stripe = require('stripe')(process.env.STRIPE_SECRET || 'sk_test_placeholder');
const paypal = require('paypal-rest-sdk');

const app = express();
const PORT = process.env.PORT || 4000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'alexandrian-tools-secret';

// Configure PayPal SDK
paypal.configure({
  mode: process.env.PAYPAL_MODE || 'sandbox',
  client_id: process.env.PAYPAL_CLIENT_ID || 'placeholder',
  client_secret: process.env.PAYPAL_CLIENT_SECRET || 'placeholder'
});

const db = new sqlite3.Database(path.resolve(__dirname, '../database.sqlite'));

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const bootstrap = async () => {
  await runAsync(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer'
    )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      imageUrl TEXT DEFAULT ''
    )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    )`);

  const admin = await getAsync('SELECT * FROM users WHERE role = ? LIMIT 1', ['owner']);
  if (!admin) {
    const hashed = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || 'AdminPass123!', 10);
    await runAsync('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [
      process.env.DEFAULT_ADMIN_USERNAME || 'owner',
      hashed,
      'owner'
    ]);
    console.log('Default owner account created.');
  }
};

bootstrap().catch((err) => {
  console.error('Failed to initialize database', err);
  process.exit(1);
});

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.resolve(__dirname, '..') }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

const requireOwner = (req, res, next) => {
  if (!req.session.user || (req.session.user.role !== 'owner' && req.session.user.role !== 'admin')) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await runAsync('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashed]);
    res.status(201).json({ message: 'Account created successfully' });
  } catch (err) {
    if (err && err.message.includes('UNIQUE')) {
      res.status(409).json({ message: 'Username already exists' });
    } else {
      console.error(err);
      res.status(500).json({ message: 'Unable to register user' });
    }
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getAsync('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ message: 'Login successful', user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to login' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/products', async (_req, res) => {
  try {
    const products = await allAsync('SELECT * FROM products ORDER BY id DESC');
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load products' });
  }
});

app.post('/api/products', requireOwner, async (req, res) => {
  try {
    const { name, description, price, imageUrl } = req.body;
    if (!name || !price) {
      return res.status(400).json({ message: 'Name and price are required' });
    }
    const result = await runAsync(
      'INSERT INTO products (name, description, price, imageUrl) VALUES (?, ?, ?, ?)',
      [name, description || '', price, imageUrl || '']
    );
    const product = await getAsync('SELECT * FROM products WHERE id = ?', [result.lastID]);
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create product' });
  }
});

app.delete('/api/products/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    await runAsync('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: 'Product removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to remove product' });
  }
});

app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const { productId, provider } = req.body;
    if (!productId || !provider) {
      return res.status(400).json({ message: 'Product and provider are required' });
    }
    const product = await getAsync('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const result = await runAsync(
      'INSERT INTO orders (userId, productId, provider, status) VALUES (?, ?, ?, ?)',
      [req.session.user.id, productId, provider, 'processing']
    );
    const order = await getAsync('SELECT * FROM orders WHERE id = ?', [result.lastID]);
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to create order' });
  }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const orders = await allAsync(
      `SELECT orders.*, products.name AS productName, products.description AS productDescription
       FROM orders
       JOIN products ON products.id = orders.productId
       WHERE orders.userId = ?
       ORDER BY orders.createdAt DESC`,
      [req.session.user.id]
    );
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to fetch orders' });
  }
});

app.post('/api/billing/stripe/session', requireAuth, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await getAsync('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: product.description
            },
            unit_amount: Math.round(product.price * 100)
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: process.env.STRIPE_SUCCESS_URL || 'https://example.com/success',
      cancel_url: process.env.STRIPE_CANCEL_URL || 'https://example.com/cancel'
    });
    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create Stripe session' });
  }
});

app.post('/api/billing/paypal/order', requireAuth, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await getAsync('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const createPaymentJson = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        return_url: process.env.PAYPAL_SUCCESS_URL || 'https://example.com/success',
        cancel_url: process.env.PAYPAL_CANCEL_URL || 'https://example.com/cancel'
      },
      transactions: [
        {
          item_list: {
            items: [
              {
                name: product.name,
                sku: `product-${product.id}`,
                price: product.price.toFixed(2),
                currency: 'USD',
                quantity: 1
              }
            ]
          },
          amount: {
            currency: 'USD',
            total: product.price.toFixed(2)
          },
          description: product.description
        }
      ]
    };

    paypal.payment.create(createPaymentJson, function (error, payment) {
      if (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create PayPal order' });
      } else {
        res.json(payment);
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to initiate PayPal order' });
  }
});

app.use(express.static(path.resolve(__dirname, '../../frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Alexandrian Tools Shop backend listening on port ${PORT}`);
});
