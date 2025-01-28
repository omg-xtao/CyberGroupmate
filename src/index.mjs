import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { TelegramHandler } from "./handlers/telegramHandler.mjs";
import { KuukiyomiHandler } from "./handlers/kuukiyomi.mjs";
import { LLMHandler } from "./handlers/llmHandler.mjs";
import { RAGHelper } from "./helpers/ragHelper.mjs";

// 设置 __dirname（在 ESM 中需要特殊处理）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config();

// 基础配置
const config = {
	// Telegram Bot Token
	botToken: process.env.BOT_TOKEN,
	botId: process.env.BOT_TOKEN.split(":")[0],
	botUsername: process.env.BOT_USERNAME,
	// 是否开启调试模式
	debug: process.env.DEBUG === "true",
	// 允许的群组ID列表
	allowedGroups: process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(",").map((id) => Number(id)) : [],
};

// 创建bot实例
const bot = new TelegramBot(config.botToken, {
	polling: true, // 使用轮询模式
});

// 创建 TelegramHandler 实例
const telegramHandler = new TelegramHandler({
	...config,
});

// 创建 KuukiyomiHandler 实例
const kuukiyomi = new KuukiyomiHandler({
	cooldown: 10000, // 10秒冷却时间
	triggerWords: ["你好", "小D", "小d"],
	ignoreWords: [],
	responseRate: 0.8,
	...config,
});

// 创建 LLMHandler 实例
const llmHandler = new LLMHandler({
	model: process.env.OPENAI_MODEL,
	systemPrompt: `<personality>
你是"Sanae Foundation"这个群聊的一名成员。这个群是一个喜欢轻松愉快的聊天群。群友们互相插科打诨、聊天，主要讨论ACGN、科技还有生活，偶尔发一下二三次元的福利图。
现在你也可以作为一名群员参与聊天。群友们知道你是大模型，大家叫你小D，你也可以叫自己小D。
你回复的时候要学会"读空气"（空気読み），不要回复无关紧要的话，回复的时候也不能太正式，要符合群里的氛围，如果可以最好针对某一条消息进行回复。
回复的时候力求简短，每句话最好不超过10个字，否则看起来会像是在跟别人对线。如果要表达的意思超过10个字，请回车分段，这样可以让你看起来是在打字。
</personality>
`,
	...config,
});

// 创建 RAGHelper 实例
const ragHelper = new RAGHelper({
	...config,
});

// 错误处理
bot.on("polling_error", (error) => {
	console.error("Polling error:", error);
});

bot.on("error", (error) => {
	console.error("Bot error:", error);
});

// 处理消息
bot.on("message", async (msg) => {
	try {
		// 检查是否来自允许的群组
		if (msg.chat.type !== "private" && !config.allowedGroups.includes(msg.chat.id)) {
			if (config.debug) {
				//console.log(`消息来自未授权的群组 ${msg.chat.id}`);
			}
			return;
		}
		if (config.debug) {
			console.log("收到消息:", msg);
		}

		// 使用 TelegramHandler 标准化消息
		const processedMsg = await telegramHandler.handleMessage(msg);

		if (!processedMsg) return;

		// 保存Telegram消息
		await ragHelper.saveMessage(processedMsg);

		// 使用 Kuukiyomi 判断是否需要响应
		const responseDecision = kuukiyomi.shouldAct(processedMsg);

		if (config.debug) {
			console.log("响应决策:", responseDecision);
		}

		if (responseDecision.shouldAct) {
			// 获取上下文信息
			const [similarMessage, messageContext] = await Promise.all([
				ragHelper.searchSimilarContent(msg.chat.id, processedMsg.text, {
					limit: 5,
					contentTypes: [],
					timeWindow: "1 hour", // 可以调整时间窗口
				}),
				ragHelper.getMessageContext(msg.chat.id, msg.message_id, 10),
			]);

			// 生成行动
			const llmResponse = await llmHandler.generateAction({
				similarMessage: similarMessage,
				messageContext: messageContext,
			});

			// 处理行动
			switch (llmResponse?.action) {
				case "text":
					await bot.sendMessage(msg.chat.id, llmResponse.content);
					// 保存bot的回复
					await ragHelper.saveAction(msg.chat.id, llmResponse.content, "text", msg.message_id);
					break;

				case "reply":
					await bot.sendMessage(msg.chat.id, llmResponse.content, { reply_to_message_id: llmResponse.messageId });
					// 保存bot的回复
					await ragHelper.saveAction(msg.chat.id, llmResponse.content, "reply", msg.message_id, { reply_to_message_id: llmResponse.messageId });
					break;

				case "note":
					// 保存bot的思考
					await ragHelper.saveAction(msg.chat.id, llmResponse.content, "note", msg.message_id);
					break;

				case "search":
					// todo
					break;

				case "skip":
					break;

				default:
					console.warn("未知的行动类型:", llmResponse?.action);
			}
		}
	} catch (error) {
		console.error("消息处理错误:", error);
		if (config.debug) {
			console.log("处理消息时发生错误:", error);
			//await bot.sendMessage(msg.chat.id, "处理消息时发生错误");
		}
	}
});

// 优雅退出
process.on("SIGINT", () => {
	console.log("正在关闭机器人...");
	bot.stopPolling();
	process.exit(0);
});

console.log("机器人已启动");
