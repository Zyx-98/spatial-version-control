# ----------- Base Stage: Install Dependencies -----------
FROM node:23-alpine AS base

WORKDIR /app

COPY package*.json ./

# ==================== Dependencies Stage ====================
FROM base AS dependencies

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# ==================== Development Stage ====================
FROM dependencies AS development

# Set environment to development
ENV NODE_ENV=development

# Expose Vite dev server port
EXPOSE 5173

# Start development server with hot reload
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ==================== Builder Stage ====================
FROM dependencies AS builder

# Build arguments for environment variables
ARG VITE_API_BASE_URL=http://localhost:3000/api

# Set build-time environment variables
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build the application
RUN npm run build

# ==================== Production Stage (with serve) ====================
FROM node:23-alpine AS production

# Install serve globally for serving static files
RUN npm install -g serve

WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:5173/ || exit 1

# Start serve
CMD ["serve", "-s", "dist", "-l", "5173"]
