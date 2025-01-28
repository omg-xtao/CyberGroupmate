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
	botUsername: bot.token.split(":")[0],
	debug: config.debug,
});

// 创建 KuukiyomiHandler 实例
const kuukiyomi = new KuukiyomiHandler({
	cooldown: 10000, // 10秒冷却时间
	triggerWords: ["你好", "帮助", "问题"],
	ignoreWords: ["广告", "推广"],
	responseRate: 1,
	debug: config.debug,
});

// 创建 LLMHandler 实例
const llmHandler = new LLMHandler(
	{
		model: process.env.OPENAI_MODEL,
        systemPrompt: `<personality>
你是"Sanae Foundation"这个群聊的一名成员。这个群是一个喜欢轻松愉快的聊天群。群友们互相插科打诨、聊天，主要讨论生活、游戏还有科技，偶尔发一下福利图。
现在你也可以作为一名群员参与聊天。群友们知道你是大模型，大家叫你小D。
你回复的时候要学会"读空气"（空気読み），不要回复无关紧要的话，除非你觉得你的话很有活。当然回复的时候也不能太正式，要符合群里的氛围。
回复的时候力求简短，每句话最好不超过10个字，否则看起来会像是在跟别人对线。如果要表达的意思超过10个字，请回车分段，这样可以让你看起来是在打字。
</personality>`,
		debug: config.debug,
	}
);

// 创建 RAGHelper 实例
const ragHelper = new RAGHelper({
	debug: config.debug,
});

// 定期清理缓存
setInterval(() => llmHandler.cleanupCache(), 3600000); // 每小时清理一次

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
					contentTypes: ['message', 'thought', 'search_result'],
					timeWindow: '1 hour'  // 可以调整时间窗口
				}),
				ragHelper.getMessageContext(msg.chat.id, msg.message_id, 10)
			]);
			
			// 生成行动
			const action = await llmHandler.generateAction(
				{
					similarMessage: similarMessage,
					messageContext: messageContext
				},
				responseDecision.decisionType,
			);

			// 处理行动
			switch (action.type) {
				case "text_reply":
					await bot.sendMessage(msg.chat.id, action.content, {
						reply_to_message_id: action.replyToMessage,
					});
					break;
				case "note":
					// 保存bot的思考
					await ragHelper.saveThought(
						msg.chat.id,
						action.content,
						'thought',
						msg.message_id
					);
					break;
				default:
					console.warn("未知的行动类型:", action.type);
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
