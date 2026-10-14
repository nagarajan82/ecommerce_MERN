FROM node:20-alpine
WORKDIR /workspace
COPY packages ./packages
COPY services/payment-service ./services/payment-service
RUN npm install --prefix /workspace/packages/event-bus
RUN npm install --prefix /workspace/packages/observability
WORKDIR /workspace/services/payment-service
RUN npm install
EXPOSE 4004
CMD ["npm", "start"]
