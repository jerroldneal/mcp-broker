FROM node:18-alpine

WORKDIR /app/mcp-broker-client
COPY mcp-broker-client/sdk.js mcp-broker-client/tool-provider.js mcp-broker-client/package.json ./
RUN npm install --omit=dev

WORKDIR /app/mcp-broker

COPY mcp-broker/package.json mcp-broker/package-lock.json ./
RUN npm ci --production

COPY mcp-broker/server.js mcp-broker/sdk.js mcp-broker/dashboard.html mcp-broker/client-dashboard.js ./

EXPOSE 3098 3099

ENV MCP_HTTP_PORT=3098 \
    BROKER_WS_PORT=3099

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3098/api/status').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
