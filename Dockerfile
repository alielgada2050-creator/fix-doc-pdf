# وثيق PDF — static app + optional Odoo/AI/auth proxy in one small container (no npm dependencies)
FROM node:20-alpine
WORKDIR /app
COPY package.json build.mjs index.html index.shell.html config.js sw.js manifest.webmanifest ./
COPY app ./app
COPY icons ./icons
COPY fonts ./fonts
COPY logos ./logos
COPY tessdata ./tessdata
COPY scripts ./scripts
COPY server/odoo-proxy.mjs ./server/odoo-proxy.mjs
RUN node build.mjs && node scripts/standalone.mjs && mkdir -p /data && chown node:node /data
ENV SERVE_STATIC=1 STATIC_DIR=/app/dist PORT=8080 DATA_DIR=/data NODE_ENV=production
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=4s CMD wget -qO- http://127.0.0.1:8080/index.html >/dev/null || exit 1
CMD ["node", "server/odoo-proxy.mjs"]
