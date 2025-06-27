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

## Endpoints (to be implemented)
- `/public` - Public directory
- `/stats` - API statistics
- `/license` - License management
- `/gameapi` - Game API info
