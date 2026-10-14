FROM node:20-alpine
WORKDIR /workspace
COPY packages ./packages
COPY gateway ./gateway
RUN npm install --prefix /workspace/packages/observability
WORKDIR /workspace/gateway
RUN npm install
EXPOSE 8080
CMD ["npm", "start"]

