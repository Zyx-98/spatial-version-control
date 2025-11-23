# ----------- Base Stage: Compile Native Modules -----------
FROM node:20-alpine AS base
WORKDIR /app

RUN apk update && apk add --no-cache \
    gdal-dev \
    gdal \
    python3 \
    make \
    g++ \
    gcc \
    pkgconf \
    libc-dev \
    linux-headers \
    zlib-dev \
    # Create symlink for node-gyp
    && ln -sf python3 /usr/bin/python

COPY package.json package-lock.json* ./

RUN npm ci --ignore-scripts

RUN npm rebuild gdal-async --build-from-source --shared_gdal

RUN npm rebuild

# ----------- Development Stage: For Local Development -----------
FROM base AS development
WORKDIR /app

COPY . .
ENV NODE_ENV=development
EXPOSE 3000

RUN rm -f /usr/bin/python

CMD ["npm", "run", "start:dev"]

# ----------- Build Stage: Build the Application -----------
FROM base AS build
WORKDIR /app
COPY . .
ENV NODE_ENV=production

RUN npm run build

# ----------- Production Stage: Final Production Image (Minimal) -----------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV GDAL_DATA=/usr/share/gdal

RUN apk update && apk add --no-cache \
    gdal \
    gdal-tools

# Setup non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

COPY --from=base /app/node_modules ./node_modules

USER appuser

EXPOSE 3000

CMD ["node", "dist/main.js"]
