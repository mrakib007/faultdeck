FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci

COPY backend/ backend/

EXPOSE 3001
CMD ["npm", "run", "dev", "-w", "backend"]
