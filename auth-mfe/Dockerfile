FROM node:22-alpine

WORKDIR /app

COPY auth-mfe/package.json auth-mfe/package-lock.json ./
RUN npm ci

COPY auth-mfe/ ./

EXPOSE 3001

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
