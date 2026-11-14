FROM node:22-bookworm-slim

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN DATABASE_URL="postgresql://ghostqa:ghostqa@localhost:5432/ghostqa?schema=public" \
    npm run db:generate \
    && DATABASE_URL="postgresql://ghostqa:ghostqa@localhost:5432/ghostqa?schema=public" \
       BETTER_AUTH_SECRET="build-only-secret-that-is-not-used-at-runtime" \
       BETTER_AUTH_URL="http://localhost:3001" \
       npm run build

RUN mkdir -p /app/data /app/public/runs \
    && chown -R node:node /app/.next /app/data /app/public/runs

USER node

EXPOSE 3001

CMD ["sh", "-c", "npm run db:migrate && npm run start"]
