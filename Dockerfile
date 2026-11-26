FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8766 DATA_FILE=/data/links.json
COPY package.json ./
COPY server.js resend-check.js ./
COPY index.html styles.css app.js ./
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8766
CMD ["node", "server.js"]
