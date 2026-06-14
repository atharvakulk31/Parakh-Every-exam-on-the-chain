FROM node:20-alpine

# Required for better-sqlite3 native build
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build Vite frontend
RUN npm run build

# HF Spaces uses port 7860
ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860

CMD ["npx", "tsx", "server/index.ts"]
