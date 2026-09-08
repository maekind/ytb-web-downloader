FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./scripts/update-yt-dlp.sh ./docker/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "src/server.js"]
