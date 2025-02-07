FROM node:20

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
# 启动命令
CMD ["npm", "start"]