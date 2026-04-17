FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# better-sqlite3 ships a native binary. Alpine doesn't include the build
# toolchain by default — install python3/make/g++ for the install step,
# then drop them so the runtime image stays slim.
RUN apk add --no-cache python3 make g++ \
	&& npm ci \
	&& apk del python3 make g++
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
EXPOSE 3001
ENV PORT=3001
CMD ["node", "build"]
