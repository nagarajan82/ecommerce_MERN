FROM node:22-alpine

WORKDIR /app

COPY orders-mfe/package.json orders-mfe/package-lock.json ./
RUN npm ci

COPY orders-mfe/ ./

EXPOSE 3004

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
