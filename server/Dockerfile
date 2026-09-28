FROM node:22-alpine
WORKDIR /app
COPY src ./src
ENV DATA_DIR=/data NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
CMD ["node", "src/index.js"]
