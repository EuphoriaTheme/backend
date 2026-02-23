# ED-API
Backend API

## Features
- API call statistics endpoints
- License management endpoint
- GameAPI endpoint (IP:PORT and GAME info)

## Scripts Included
- Update GameDig List: "node ./scripts/updateGamesYml.js",
- Fetch Game Icons: "node ./scripts/fetchGameIcons.js"

## Setup
1. Install dependencies:
   ```sh
   yarn install
   ```
2. Configure your `.env` file with MongoDB and Discord credentials.
3. Start the server:
   ```sh
   yarn nodemon index.js
   ```

### Blueprint sync (every 24h)
The server syncs `public/blueprint.json` from Blueprint extensions API on startup and every 24 hours.

If the upstream is behind Cloudflare challenge, set a browser cookie header in `.env`:

```env
BLUEPRINT_EXTENSIONS_URL=https://api.blueprintframe.work/api/extensions
BLUEPRINT_EXTENSIONS_FALLBACK_URL=https://blueprint.zip/api/extensions
BLUEPRINT_SYNC_COOKIE=cf_clearance=...; __cf_bm=...
BLUEPRINT_SYNC_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36
BLUEPRINT_SYNC_ORIGIN=https://blueprintframe.work
BLUEPRINT_SYNC_REFERER=https://blueprintframe.work/
```

## Endpoints (to be implemented)
- `/public` - Public directory
- `/stats` - API statistics
- `/license` - License management
- `/gameapi` - Game API info
