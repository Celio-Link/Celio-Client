FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --base-href=/

FROM caddy:2-alpine
COPY --from=build /app/dist/linkClientNext/browser /srv
# Railway provides the port in $PORT
CMD caddy file-server --root /srv --listen :$PORT
