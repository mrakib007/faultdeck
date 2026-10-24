# faultdeck

A self-hosted failure dashboard for RabbitMQ jobs. This repository currently contains the React 19 frontend and TypeScript API scaffolding; the RabbitMQ integration and Go collector are planned in [PLAN.md](PLAN.md).

The first integration artifact is the [versioned failure-event contract](contracts/README.md). The publisher, collector, and persistence are not implemented yet.

## Local development

### All services with Docker

Requires Docker with Compose. From the repository root:

```sh
docker compose up --build
```

Open http://localhost:5173 for the frontend, http://localhost:3001/health for the API, and http://localhost:15672 for RabbitMQ management (`faultdeck` / `faultdeck_dev`). PostgreSQL and RabbitMQ use persistent named volumes. Stop the stack with `docker compose down` (without `-v` to keep the data).

PostgreSQL is available from the host on port `15432` (the backend connects internally on port `5432`).

These are development-only credentials. The backend does not connect to PostgreSQL or RabbitMQ yet; the URLs are configured for when those integrations are built. The current images copy source at build time, so rebuild after editing code (`docker compose up --build`).

### Run the apps outside Docker

Requires Node.js and npm. You can run the frontend and API without the infrastructure for now. The dashboard currently uses explicitly labeled demo data.

```sh
npm install
npm run dev
```

The frontend runs at http://localhost:5173 and the API health endpoint is at http://localhost:3001/health. Run `npm run build` to build both workspaces.
