# Product-testing pass, 2026-08-28, gap #7. The frontend is a Vite SPA —
# there's no server-side runtime, just a static `dist/` to serve, so the
# runtime stage is nginx, not Node. See `deploy/nginx.conf` for the one
# thing a plain static file server doesn't do for free: routing every
# unknown path back to index.html for React Router's client-side routes.
#
# VITE_API_BASE_URL is a real build-time input, not a runtime one — Vite
# inlines `import.meta.env.*` into the built JS at build time, so the
# backend origin has to be known when this image is built, not when the
# container starts (see this repo's docker-compose.yml for how the two
# images' origins are wired together).

FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/SureStock-frontend/package.json apps/SureStock-frontend/package.json
RUN npm ci

COPY apps/SureStock-frontend apps/SureStock-frontend
WORKDIR /app/apps/SureStock-frontend

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/SureStock-frontend/dist /usr/share/nginx/html
EXPOSE 80
