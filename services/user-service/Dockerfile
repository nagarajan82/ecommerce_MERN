FROM node:20-alpine
WORKDIR /workspace
COPY packages ./packages
COPY services/user-service ./services/user-service
RUN npm install --prefix /workspace/packages/event-bus
WORKDIR /workspace/services/user-service
RUN npm install
EXPOSE 4001
CMD ["npm", "start"]
