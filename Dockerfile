FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
