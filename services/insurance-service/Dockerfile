FROM node:20-alpine

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js .

RUN addgroup -S app && adduser -S app -G app
USER app

ENV PORT=8000
EXPOSE 8000
CMD ["node", "server.js"]
