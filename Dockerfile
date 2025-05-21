FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Copy source code and build the application
COPY . .
RUN pnpm build



# Production environment image
FROM node:20-alpine

WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./
# Copy .env file to dist directory
COPY .env app/
# Install pnpm and production dependencies
RUN npm install -g pnpm && pnpm install --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variable
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/bot.js"]