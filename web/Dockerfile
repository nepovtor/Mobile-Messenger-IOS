FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL
ARG VITE_WEBSOCKET_URL
ARG VITE_TELEGRAM_BOT_USERNAME

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WEBSOCKET_URL=${VITE_WEBSOCKET_URL}
ENV VITE_TELEGRAM_BOT_USERNAME=${VITE_TELEGRAM_BOT_USERNAME}

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
COPY MobileMessengerIOS/Assets.xcassets/AppIcon.appiconset /app/MobileMessengerIOS/Assets.xcassets/AppIcon.appiconset
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g serve

COPY --from=build /app/web/dist ./dist

EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
