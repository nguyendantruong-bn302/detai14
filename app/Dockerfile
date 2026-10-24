
FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY server.js ./
RUN mkdir -p /var/log/project-management \
    && chown -R node:node /app /var/log/project-management

EXPOSE 3000

USER node

CMD ["npm", "start"]
    