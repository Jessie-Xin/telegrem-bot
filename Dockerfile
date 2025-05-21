FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm install

# Copy source code and build the application
COPY --chown=node:node . .
RUN pnpm build

# Production environment image
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy package files and install production dependencies
COPY --chown=appuser:appgroup package.json pnpm-lock.yaml ./
COPY --chown=appuser:appgroup .env ./
RUN npm install -g pnpm && \
    pnpm install --prod && \
    npm uninstall -g pnpm

# Copy built application from builder stage
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Set environment and user
ENV NODE_ENV=production
USER appuser

# Start the application
CMD ["node", "dist/bot.js"]