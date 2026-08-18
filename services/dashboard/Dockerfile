FROM node:20-alpine

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js .
COPY public ./public

RUN addgroup -S app && adduser -S app -G app
USER app

# Overridable only via `docker build --build-arg` for one-off "bad" canary
# demo images — defaults keep every normal build (including CI) clean.
ARG FAIL_MODE=false
ARG FAIL_TILES=""
ENV PORT=3000
ENV FAIL_MODE=${FAIL_MODE}
ENV FAIL_TILES=${FAIL_TILES}
EXPOSE 3000
CMD ["node", "server.js"]
