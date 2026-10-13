FROM node:22-alpine

WORKDIR /app

COPY checkout-mfe/package.json checkout-mfe/package-lock.json ./
RUN npm ci

COPY checkout-mfe/ ./

EXPOSE 3003

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
