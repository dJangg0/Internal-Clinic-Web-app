FROM node:22-alpine

WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
COPY db ./db
WORKDIR /app/backend
EXPOSE 3000
CMD ["npm", "run", "dev"]
