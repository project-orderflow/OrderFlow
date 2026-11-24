# Этап 1: Сборка React/Vite приложения
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=/api
RUN VITE_API_URL="$VITE_API_URL" npm run build -- --mode local-api

# Этап 2: Раздача скомпилированного кода через Nginx
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
