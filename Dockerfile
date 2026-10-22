# The site as a container: nginx serving the build, /config.js written from environment variables at start-up
# (deploy/entrypoint.sh). One image for every environment and every house.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.31-alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2
# Security fixes published after the base image was built.
RUN apk upgrade --no-cache
COPY --from=build /src/dist /srv/site
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && rm -f /srv/site/config.js
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
