# TaskFlow

TaskFlow is a MERN task monitoring and collaboration system. The repository contains a Vite React client and an Express/Mongoose API.

## Run locally

1. Install dependencies: `npm install`, `npm install --prefix client`, and `npm install --prefix server`.
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` and `JWT_SECRET`.
3. Start MongoDB, then run `npm run dev`.
4. Open `http://localhost:5173`.

The API health check is available at `GET /api/health`. Authenticated task requests use `Authorization: Bearer <token>`.