# Self-hosted path: same build as Vercel runs, served by nginx.
# Build context is the REPO ROOT, not deploy/ — the app build reads ../src/lib.
#
#   docker build -f deploy/Dockerfile -t harmonic \
#     --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=<anon-public-key> .
#   docker run -p 8080:80 harmonic
#
# Vite inlines VITE_* at BUILD time, so these are build args, not runtime env.
# Both are public values (the anon key ships in the client bundle either way);
# real secrets never belong here.

FROM node:20-alpine AS build
WORKDIR /repo

# Only the app's lockfile is needed: vite.config.js aliases @backend to
# ../src/lib and dedupes its packages into app/node_modules, so the frontend
# builds without a root install (this is what the CI `app` job does too).
COPY app/package.json app/package-lock.json ./app/
RUN npm --prefix app ci

COPY app ./app
COPY src ./src

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm --prefix app run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/app/dist /usr/share/nginx/html
EXPOSE 80
