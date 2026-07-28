FROM node:22-alpine

LABEL org.opencontainers.image.title="Project Koma"
LABEL org.opencontainers.image.description="AI defense toolkit demo — sandboxed"

WORKDIR /app

# Copy only what the demo needs
COPY demo/server.js demo/server.js
COPY docs/guard-request.json docs/guard-request.json
COPY docs/scout-small-request.json docs/scout-small-request.json
COPY docs/scout-large-request.json docs/scout-large-request.json
COPY docs/ingest-request.json docs/ingest-request.json

# No host filesystem access. No environment variables leaked.
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "demo/server.js"]
