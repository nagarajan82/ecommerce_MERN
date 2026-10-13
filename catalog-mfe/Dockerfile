FROM node:22-alpine

WORKDIR /app

COPY catalog-mfe/package.json catalog-mfe/package-lock.json ./
RUN npm ci

COPY catalog-mfe/ ./

EXPOSE 3002

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
