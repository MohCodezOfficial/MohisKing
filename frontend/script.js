const apiBase = window.location.origin.replace(/\/$/, '');
const statusText = document.querySelector('.status-text');
const statusUser = document.getElementById('status-user');
const productGrid = document.getElementById('product-grid');
const adminSection = document.getElementById('admin');
const adminProducts = document.getElementById('admin-products');
const productTemplate = document.getElementById('product-card-template');
const adminTemplate = document.getElementById('admin-item-template');
const ordersList = document.getElementById('orders-list');
const tabs = document.querySelectorAll('.tab-button');
const tabContent = document.querySelectorAll('.tab');
const yearEl = document.getElementById('year');
const searchInput = document.getElementById('product-search');

let currentUser = null;
let products = [];

const fetchOptions = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: body ? JSON.stringify(body) : undefined
});

const initStarfield = () => {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  const stars = Array.from({ length: 180 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    z: Math.random() * width
  }));

  const render = () => {
    ctx.fillStyle = 'rgba(5, 10, 22, 0.6)';
    ctx.fillRect(0, 0, width, height);

    for (const star of stars) {
      star.z -= 2;
      if (star.z <= 0) star.z = width;

      const k = 128 / star.z;
      const px = star.x * k + width / 2;
      const py = star.y * k + height / 2;

      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const size = (1 - star.z / width) * 2.5;
      const alpha = 0.8 - star.z / width;
      ctx.fillStyle = `rgba(76, 243, 255, ${alpha})`;
      ctx.fillRect(px, py, size, size);
    }

    requestAnimationFrame(render);
  };

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  render();
};

const setStatus = (message) => {
  statusText.textContent = message;
};

const setUser = (user) => {
  currentUser = user;
  if (user) {
    statusUser.textContent = `Logged in as ${user.username} (${user.role})`;
    adminSection.classList.toggle('hidden', !(user.role === 'owner' || user.role === 'admin'));
    loadOrders();
  } else {
    statusUser.textContent = 'Anonymous Operative';
    adminSection.classList.add('hidden');
    ordersList.innerHTML = '<p class="muted">Authenticate to view your automation history.</p>';
  }
};

const createProductCard = (product) => {
  const fragment = productTemplate.content.cloneNode(true);
  fragment.querySelector('h3').textContent = product.name;
  fragment.querySelector('.description').textContent = product.description || 'Elite module awaiting deployment.';
  fragment.querySelector('.price').textContent = `$${Number(product.price).toFixed(2)}`;
  const img = fragment.querySelector('img');
  img.src = product.imageUrl || 'https://images.unsplash.com/photo-1527430253228-e93688616381?auto=format&fit=crop&w=600&q=80';
  img.alt = product.name;

  fragment.querySelector('.buy-stripe').addEventListener('click', () => initiateCheckout(product.id, 'stripe'));
  fragment.querySelector('.buy-paypal').addEventListener('click', () => initiateCheckout(product.id, 'paypal'));
  return fragment;
};

const createAdminItem = (product) => {
  const fragment = adminTemplate.content.cloneNode(true);
  fragment.querySelector('h4').textContent = product.name;
  fragment.querySelector('.price').textContent = `$${Number(product.price).toFixed(2)}`;
  fragment.querySelector('button').addEventListener('click', () => removeProduct(product.id));
  return fragment;
};

const renderProducts = () => {
  const filter = searchInput.value?.toLowerCase() || '';
  productGrid.innerHTML = '';
  products
    .filter((p) => !filter || p.name.toLowerCase().includes(filter) || p.description?.toLowerCase().includes(filter))
    .forEach((product) => productGrid.appendChild(createProductCard(product)));

  if (currentUser && (currentUser.role === 'owner' || currentUser.role === 'admin')) {
    adminProducts.innerHTML = '';
    products.forEach((product) => adminProducts.appendChild(createAdminItem(product)));
  }
};

const loadProducts = async () => {
  setStatus('Syncing arsenal inventory...');
  try {
    const response = await fetch(`${apiBase}/api/products`, { credentials: 'include' });
    if (!response.ok) throw new Error('Request failed');
    products = await response.json();
    renderProducts();
    setStatus('Arsenal synchronized. Ready for deployment.');
  } catch (error) {
    console.error(error);
    setStatus('Unable to load arsenal inventory.');
  }
};

const loadOrders = async () => {
  if (!currentUser) return;
  try {
    const response = await fetch(`${apiBase}/api/orders`, { credentials: 'include' });
    if (!response.ok) throw new Error('Request failed');
    const orders = await response.json();
    if (!orders.length) {
      ordersList.innerHTML = '<p class="muted">No automation purchases yet. Deploy your first module!</p>';
      return;
    }
    ordersList.innerHTML = '';
    for (const order of orders) {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.innerHTML = `
        <strong>${order.productName}</strong>
        <span class="muted">${order.productDescription || 'No description provided.'}</span>
        <span>Purchased via ${order.provider} · ${new Date(order.createdAt).toLocaleString()}</span>
        <span class="muted">Status: ${order.status}</span>
      `;
      ordersList.appendChild(card);
    }
  } catch (error) {
    console.error(error);
    ordersList.innerHTML = '<p class="muted">Unable to load orders.</p>';
  }
};

const initiateCheckout = async (productId, provider) => {
  if (!currentUser) {
    setStatus('Login required to initiate checkout.');
    return;
  }
  try {
    if (provider === 'stripe') {
      const response = await fetch(`${apiBase}/api/billing/stripe/session`, fetchOptions('POST', { productId }));
      const data = await response.json();
      if (data.url) window.open(data.url, '_blank');
    } else if (provider === 'paypal') {
      const response = await fetch(`${apiBase}/api/billing/paypal/order`, fetchOptions('POST', { productId }));
      const data = await response.json();
      const approval = data.links?.find((link) => link.rel === 'approval_url');
      if (approval) window.open(approval.href, '_blank');
    }

    await fetch(`${apiBase}/api/orders`, fetchOptions('POST', { productId, provider }));
    await loadOrders();
    setStatus('Checkout initiated. Monitor your inbox for confirmation.');
  } catch (error) {
    console.error(error);
    setStatus('Unable to initiate checkout.');
  }
};

const register = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  try {
    const response = await fetch(`${apiBase}/api/auth/register`, fetchOptions('POST', Object.fromEntries(formData)));
    if (!response.ok) throw new Error('Registration failed');
    setStatus('Registration complete. You may now login.');
    tabs.forEach((tab) => tab.classList.remove('active'));
    document.querySelector('[data-tab="login"]').classList.add('active');
    tabContent.forEach((tab) => tab.classList.remove('active'));
    document.getElementById('tab-login').classList.add('active');
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus('Unable to register. Username may be taken.');
  }
};

const login = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  try {
    const response = await fetch(`${apiBase}/api/auth/login`, fetchOptions('POST', Object.fromEntries(formData)));
    if (!response.ok) throw new Error('Login failed');
    const data = await response.json();
    setUser(data.user);
    setStatus('Authenticated. Control deck unlocked.');
    await loadProducts();
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus('Login failed. Check credentials.');
  }
};

const logout = async () => {
  await fetch(`${apiBase}/api/auth/logout`, fetchOptions('POST'));
  setUser(null);
};

const removeProduct = async (id) => {
  try {
    const response = await fetch(`${apiBase}/api/products/${id}`, fetchOptions('DELETE'));
    if (!response.ok) throw new Error('Delete failed');
    setStatus('Product removed from arsenal.');
    await loadProducts();
  } catch (error) {
    console.error(error);
    setStatus('Failed to remove product.');
  }
};

const addProduct = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  try {
    const response = await fetch(`${apiBase}/api/products`, fetchOptions('POST', Object.fromEntries(formData)));
    if (!response.ok) throw new Error('Create failed');
    setStatus('Product deployed successfully.');
    form.reset();
    await loadProducts();
  } catch (error) {
    console.error(error);
    setStatus('Failed to deploy product.');
  }
};

const initTabs = () => {
  tabs.forEach((button) => {
    button.addEventListener('click', () => {
      tabs.forEach((btn) => btn.classList.remove('active'));
      tabContent.forEach((tab) => tab.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(`tab-${button.dataset.tab}`).classList.add('active');
    });
  });
};

const initAuthState = async () => {
  try {
    const response = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed');
    const data = await response.json();
    setUser(data.user);
  } catch (error) {
    console.error(error);
    setUser(null);
  }
};

const bindEvents = () => {
  document.getElementById('register-form').addEventListener('submit', register);
  document.getElementById('login-form').addEventListener('submit', login);
  document.getElementById('product-form').addEventListener('submit', addProduct);
  document.getElementById('refresh-products').addEventListener('click', loadProducts);
  searchInput.addEventListener('input', renderProducts);
  document.getElementById('cta').addEventListener('click', () => {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  });
};

const init = async () => {
  initStarfield();
  initTabs();
  bindEvents();
  yearEl.textContent = new Date().getFullYear();
  await initAuthState();
  await loadProducts();
};

window.addEventListener('load', init);

window.addEventListener('beforeunload', () => {
  statusText.textContent = 'Terminating connection...';
});

// Expose logout for console debugging
window.logout = logout;
