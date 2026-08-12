FROM node:20-alpine

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js .
COPY public ./public

RUN addgroup -S app && adduser -S app -G app
USER app

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
