## 赛博群友

你的赛博群友哦，可以帮你语义搜索聊天记录，上网冲浪，陪你一起聊天、吐槽、发电甚至……？总之，一切皆有可能。

终极目标是——让新来的群友一点都看不出这是赛博群友！

目前只支持 Telegram

## 功能特点

-   自然语言处理
-   图像识别和分析
-   智能的对话管理和响应机制
-   支持群组和私聊
-   可配置的响应策略
-   支持消息历史记录和语义搜索

## 技术栈

-   Node.js
-   PostgreSQL + pgvector

## 安装

1. 克隆仓库：

```bash
git clone https://github.com/Archeb/CyberGroupmate.git
cd CyberGroupmate
```

2. 安装依赖：

```bash
npm install
```

3. 配置机器人：

```bash
cp src/config.example.js src/config.js
# 编辑config.js文件，根据需要调整配置
```

## 配置说明

主要配置文件位于`src/config.example.js`，分为三层配置项：

-   基础配置（base）
    -   Telegram 配置
    -   actionGenerator 配置（聊天主模型）
    -   数据库配置
    -   Kuukiyomi（回复策略）
-   聊天集配置（collections）
-   聊天配置（chats）

请先复制一份为 config.js 然后再编辑。collections/chats 配置可以覆盖基础配置

## 项目结构

```
src/
├── config.js              # 配置文件
├── index.js               # 入口文件
├── types/                 # 类型定义
├── handlers/              # 消息处理器
├── helpers/               # 辅助功能
└── managers/              # 管理器
```

## 许可证

本项目采用 GPLv3 许可证。详见[LICENSE](LICENSE)文件。
