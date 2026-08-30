# NationMart API — production image
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies (skip postinstall build until source is present)
COPY package*.json ./
RUN npm install --ignore-scripts

# Build TypeScript -> dist
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 5000

# Healthcheck hits the API health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "dist/server.js"]
