FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY server.js sdk.js dashboard.html ./

EXPOSE 3098 3099

ENV MCP_HTTP_PORT=3098 \
    BROKER_WS_PORT=3099

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3098/api/status').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
