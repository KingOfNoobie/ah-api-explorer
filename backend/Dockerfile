FROM node:22-alpine

WORKDIR /app

COPY backend/package.json ./
RUN npm install --omit=dev

COPY backend/ ./
COPY hacs/ ./hacs/

ENV DATA_DIR=/data
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
