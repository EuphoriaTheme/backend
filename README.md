# ED-API

Backend API for license verification, game server querying, translations, products, contributors, donators, and stats.

## Runtime

This branch runs on Fastify.

## Scripts

- `npm run dev` - Start Fastify in watch mode
- `npm run build` - Build placeholder (no compile step required)
- `npm run start` - Start Fastify server
- `npm run update:games` - Update game definitions
- `npm run fetch:gameicons` - Fetch game icons
- `npm run sync:translations` - Sync translation files now
- `npm run sync:blueprint` - Sync blueprint extensions now

## Setup

1. Install dependencies:

```sh
npm install
```

2. Configure `.env` with required credentials and optional sync settings.

3. Start development server:

```sh
npm run dev
```

4. Start production runtime:

```sh
npm run start
```

## Reverse Proxy Setup (Cloudflare + Nginx)

For a Cloudflare -> Nginx -> API chain, set these values in `.env`:

```env
PROXY_MODE=cloudflare
TRUST_PROXY=true
TRUST_PROXY_HOPS=1
HOST=0.0.0.0
PORT=3000
```

Use this Nginx location block so client IP forwarding works correctly:

```nginx
location / {
	proxy_pass http://127.0.0.1:3000;

	proxy_http_version 1.1;
	proxy_set_header Host $host;

	# Proxy chain headers
	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header X-Forwarded-Proto $scheme;
	proxy_set_header X-Forwarded-Host $host;
	proxy_set_header X-Real-IP $remote_addr;

	# Cloudflare origin client IP headers
	proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
	proxy_set_header True-Client-IP $http_true_client_ip;
}
```

Notes:

- Keep Cloudflare proxy enabled for the public DNS record.
- Restrict origin traffic so only Cloudflare can reach Nginx.
- Keep `TRUST_PROXY_HOPS=1` when Nginx is the direct upstream for the API.

## Blueprint Sync

`public/blueprint.json` is synced at startup and every 24 hours.

Optional `.env` settings:

```env
BLUEPRINT_EXTENSIONS_URL=https://api.blueprintframe.work/api/extensions
BLUEPRINT_EXTENSIONS_FALLBACK_URL=https://blueprint.zip/api/extensions
BLUEPRINT_SYNC_COOKIE=
BLUEPRINT_SYNC_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36
BLUEPRINT_SYNC_ORIGIN=https://blueprintframe.work
BLUEPRINT_SYNC_REFERER=https://blueprintframe.work/
BLUEPRINT_SYNC_INTERVAL_MS=86400000
BLUEPRINT_SYNC_TIMEOUT_MS=20000
```

## Translation Sync

Translations under `public/translations` are synced at startup and every 24 hours.

Optional `.env` settings:

```env
TRANSLATIONS_REPO_OWNER=EuphoriaTheme
TRANSLATIONS_REPO_NAME=blueprint-translations
TRANSLATIONS_REPO_REF=main
TRANSLATIONS_SYNC_INTERVAL_MS=86400000
TRANSLATIONS_SYNC_TIMEOUT_MS=20000
TRANSLATIONS_SYNC_GITHUB_TOKEN=
```

## Main Endpoints

- `GET /`
- `GET /health`
- `GET /public/*`
- `GET /stats`
- `GET /products`
- `GET /donators`
- `GET /contributors`
- `GET /translations`
- `POST /translations/translate/bulk`
- `GET /gameapi`
- `GET /gameapi/:game/ip=:ip&port=:port`
- `POST /license/verify-license`
- `POST /license/v2/verify-license`
- `GET /versions`
- `GET /rcon/health`
- `POST /rcon/variables`
- `POST /rcon/players`

## License API Configuration

Optional `.env` overrides:

```env
LICENSE_API_V1_URL=https://license.euphoriadevelopment.uk/api/v1/validate
LICENSE_API_V2_URL=https://licensing.euphoriadevelopment.uk/api/licenses/validate
LICENSE_API_V2_TOKEN=optional-bearer-token-for-v2
```

`POST /license/v2/verify-license` body example:

```json
{
	"productId": "my-product-id",
	"licenseKey": "ABCD-EFGH-IJKL-MNOP",
	"hwid": "pc-main-rig-01",
	"ip": "203.0.113.10"
}
```
