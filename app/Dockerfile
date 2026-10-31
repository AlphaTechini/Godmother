# Plain COPY and RUN only: Cloud Build's default docker builder has no BuildKit syntax.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Origins allowed to upload photos are fixed at build time.
ARG TRUSTED_ORIGINS=https://godmother.cyberpunkinc.xyz,https://godmother-six.vercel.app
RUN pnpm build
RUN pnpm prune --prod --ignore-scripts

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/demo ./demo
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
RUN mkdir data && chown node:node data
USER node
CMD ["node", "build"]
