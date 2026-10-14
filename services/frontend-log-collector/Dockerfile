FROM node:20-alpine

WORKDIR /workspace/services/frontend-log-collector

# Copy package definitions and install production dependencies
COPY services/frontend-log-collector/package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY services/frontend-log-collector/src ./src
COPY services/frontend-log-collector/README.md ./

EXPOSE 4006

CMD ["npm", "start"]
