FROM node:20-alpine
WORKDIR /workspace
COPY packages ./packages
COPY services/order-service ./services/order-service
RUN npm install --prefix /workspace/packages/event-bus
RUN npm install --prefix /workspace/packages/observability
WORKDIR /workspace/services/order-service
RUN npm install
EXPOSE 4003
CMD ["npm", "start"]
