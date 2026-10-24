# faultdeck

A self-hosted failure dashboard for RabbitMQ jobs. This repository currently contains the React 19 frontend and TypeScript API scaffolding; the RabbitMQ integration and Go collector are planned in [PLAN.md](PLAN.md).

## Local development

Requires Node.js and npm.

```sh
npm install
npm run dev:frontend
```

In another terminal:

```sh
npm run dev:backend
```

The frontend runs at http://localhost:5173 and the API health endpoint is at http://localhost:3001/health. Run `npm run build` to build both workspaces.
