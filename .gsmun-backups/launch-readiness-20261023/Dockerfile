FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@10.6.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY experiences/complete-shelf ./experiences/complete-shelf
RUN pnpm --filter @mint/playground-experience-complete-shelf install --frozen-lockfile
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mint/playground-experience-complete-shelf build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/experiences/complete-shelf/dist/standalone ./
COPY --from=build --chown=node:node /repo/experiences/complete-shelf/dist/static ./experiences/complete-shelf/dist/static
COPY --from=build --chown=node:node /repo/experiences/complete-shelf/public ./experiences/complete-shelf/public
WORKDIR /app/experiences/complete-shelf
RUN mkdir -p /tmp/gsmun-media-cache /var/lib/gsmun-worker && chown node:node /tmp/gsmun-media-cache /var/lib/gsmun-worker && chmod 700 /var/lib/gsmun-worker
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
