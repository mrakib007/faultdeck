FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci

COPY frontend/ frontend/

EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "frontend", "--", "--host", "0.0.0.0"]
