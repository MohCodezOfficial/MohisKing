# Alexandrian Tools Shop

A stylized dark sci-fi storefront for **Alexandrian Tools Shop** with:

- Animated, neon-inspired front-end with responsive design.
- Node.js/Express backend with SQLite for accounts, sessions, products, and orders.
- Stripe Checkout and PayPal payment scaffolding.
- Discord bot (Python) for remote product management.
- Pterodactyl helper (Python) for server provisioning flows.

## Project structure

```
backend/               # Express API + SQLite storage
  src/server.js        # Core server implementation
frontend/              # Static front-end assets (HTML, CSS, JS)
python/
  discord_bot/         # Discord management bot
  pterodactyl_support/ # API helper for Pterodactyl automation
```

## Getting started

### Backend

```bash
cd backend
npm install
npm run start
```

Create `backend/.env` for secrets:

```
PORT=4000
SESSION_SECRET=super-secret
DEFAULT_ADMIN_USERNAME=owner
DEFAULT_ADMIN_PASSWORD=ChangeMe123!
STRIPE_SECRET=sk_test_xxx
STRIPE_SUCCESS_URL=https://your-domain.com/success
STRIPE_CANCEL_URL=https://your-domain.com/cancel
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your-paypal-id
PAYPAL_CLIENT_SECRET=your-paypal-secret
PAYPAL_SUCCESS_URL=https://your-domain.com/success
PAYPAL_CANCEL_URL=https://your-domain.com/cancel
CORS_ORIGIN=https://your-frontend-domain.com
```

The backend serves the static front-end directly; deploy behind a reverse proxy with HTTPS for custom domains.

### Front-end

During development the API serves the front-end automatically. For static hosting, build tooling can wrap `frontend/`.

### Discord bot

```bash
cd python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python discord_bot/bot.py
```

Environment variables (`python/.env`) for the bot:

```
ATS_DISCORD_TOKEN=your-discord-bot-token
ATS_API_BASE=https://your-domain.com
ATS_OWNER_USERNAME=owner
ATS_OWNER_PASSWORD=ChangeMe123!
```

### Pterodactyl automation helper

Configure `python/.env` with your panel credentials:

```
PTERODACTYL_API_KEY=ptla_...
PTERODACTYL_PANEL_URL=https://panel.example.com
PTERODACTYL_DEFAULT_EGG=1
PTERODACTYL_DEFAULT_LOCATION=1
```

Run the demo to verify connectivity:

```bash
python pterodactyl_support/manager.py
```

### Stripe & PayPal testing

Stripe Checkout and PayPal interactions require valid keys. In development the handlers will still return placeholder responses for testing flows.

### Domain support

The application is ready to run behind Nginx/Apache or managed services. Ensure environment variables reflect the production domain, enable HTTPS, and forward `/api/*` to the Express backend.

### Customer panel

Customers automatically receive an order history panel after login. Purchasing a product records it in the SQLite database and surfaces it under the **Orders** tab.

## Security notes

- Update the default owner password immediately.
- Use HTTPS in production and configure `SESSION_SECRET` with a strong random value.
- Restrict Discord bot commands to trusted channels/roles using Discord permissions.

## License

MIT
