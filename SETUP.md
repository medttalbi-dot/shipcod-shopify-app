# ShipCOD Shopify App — Setup Guide

## Prerequisites
- Node.js 18.20+
- A Shopify Partners account
- A Shopify app created in the Partners dashboard

## 1. Install dependencies
```bash
npm install
```

## 2. Configure environment
```bash
cp .env.example .env
```

Fill in `.env`:
```
SHOPIFY_API_KEY=        # From Shopify Partners > App > API credentials
SHOPIFY_API_SECRET=     # From Shopify Partners > App > API credentials
SHOPIFY_APP_URL=        # Your tunnel or production URL
DATABASE_URL=file:./dev.db   # SQLite for dev
ENCRYPTION_KEY=         # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SCOPES=read_orders,write_orders
```

## 3. Set up database
```bash
npx prisma migrate dev --name init
```

## 4. Link Shopify app config
```bash
npm run config:link
```
This connects your local `shopify.app.toml` to your Partners app.

## 5. Run locally
```bash
npm run dev
```
The Shopify CLI will create an ngrok tunnel and open a browser for you to install the app on a dev store.

---

## Production deployment

### Switch to PostgreSQL
1. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. Update `DATABASE_URL` in your production environment.
3. Run `npx prisma migrate deploy`.

### Required environment variables (production)
| Variable | Description |
|---|---|
| `SHOPIFY_API_KEY` | Shopify Partners API key |
| `SHOPIFY_API_SECRET` | Shopify Partners API secret |
| `SHOPIFY_APP_URL` | Your production URL (no trailing slash) |
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM |
| `SCOPES` | `read_orders,write_orders` |

### Generate a secure ENCRYPTION_KEY
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Store this in your secrets manager. If you lose it, you cannot decrypt stored SECRET_CODEs.

---

## Security notes
- `SECRET_CODE` is encrypted with AES-256-GCM before DB write.
- `SECRET_CODE` is never returned to the frontend — only a masked preview.
- The webhook URL contains `key` and `secret` as query params (this is by ShipCOD API design).
- Shopify session tokens and CSRF protection are handled by `@shopify/shopify-app-remix`.
- GDPR webhooks (`CUSTOMERS_DATA_REQUEST`, `CUSTOMERS_REDACT`, `SHOP_REDACT`) are handled in `/webhooks`.
