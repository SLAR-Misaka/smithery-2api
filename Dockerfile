# ====================================================================
# Dockerfile for smithery-2api (Deno Edition)
# ====================================================================

FROM denoland/deno:alpine-1.44.4

WORKDIR /app

COPY deno.json ./
COPY src ./src

EXPOSE 8088

CMD ["deno", "task", "start"]
