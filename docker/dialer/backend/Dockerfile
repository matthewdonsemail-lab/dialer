FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built app
COPY --from=builder /app/dist ./dist

# Create data directory
RUN mkdir -p /app/data

EXPOSE 4000

CMD ["node", "dist/index.cjs"]
