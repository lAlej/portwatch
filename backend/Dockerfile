# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- runtime ---
FROM node:22-alpine
RUN apk add --no-cache openssh-client git
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 4000
CMD ["node", "dist/index.js"]
