import OpenAI from "openai";

export class BotActionHelper {
	constructor(chatConfig, bot, ragHelper) {
		this.chatConfig = chatConfig;
		this.bot = bot;
		this.ragHelper = ragHelper;
	}

	async sendText(chatId, content, log = true) {
		await this.bot.sendMessage(chatId, content);
		if (this.chatConfig.debug) console.log("发送文本：", content);
		if (log) await this.ragHelper.saveAction(chatId, content, "text");
	}

	async setTyping(chatId) {
		await this.bot.sendChatAction(chatId, "typing");
	}

	async sendReply(chatId, content, replyToMessageId, log = true) {
		await this.bot.sendMessage(chatId, content, { reply_to_message_id: replyToMessageId });
		if (this.chatConfig.debug) console.log("发送回复：", content);
		if (log)
			await this.ragHelper.saveAction(chatId, content, "reply", {
				reply_to_message_id: replyToMessageId,
			});
	}

	async saveAction(chatId, content, type, additionalMetadata = {}) {
		await this.ragHelper.saveAction(chatId, content, type, additionalMetadata);
	}

	async search(chatId, keyword) {
		const searchResults = await this.ragHelper.searchSimilarContent(chatId, keyword, {
			limit: 5,
			contentTypes: ["message", "reply"],
			withContext: 3,
		});
		return searchResults;
	}

	async googleSearch(query, num = 5) {
		const url = `https://www.googleapis.com/customsearch/v1?key=${
			this.chatConfig.google.apiKey
		}&cx=${this.chatConfig.google.cseId}&q=${encodeURIComponent(query)}&num=${num}`;

		try {
			const response = await fetch(url);
			const data = await response.json();

			if (data.items && data.items.length > 0) {
				return data.items.map((item) => ({
					title: item.title,
					link: item.link,
					snippet: item.snippet,
				}));
			}
			return [];
		} catch (error) {
			console.error("搜索出错:", error);
			return [];
		}
	}

	async updateMemory(messageId, updatePrompt) {
		try {
			// 构建系统提示词
			const systemPrompt = `你是一个记忆管理助手。你的任务是根据用户的指示来更新或创建记忆。
记忆应该是简洁、客观的描述，避免主观评价。
如果是创建新记忆，请直接输出新的记忆内容。
如果是更新现有记忆，请基于现有记忆进行修改。
直接输出最终的记忆内容，不需要其他解释。`;

			// 根据messageId从ragHelper中获取用户相关信息，从而获取用户ID
			const message = await this.ragHelper.getMessage(messageId);
			const userId = message.metadata?.from?.id;
			if (!userId) {
				throw new Error("无法获取用户ID");
			}
			// 获取现有记忆
			const memoryRecord = await this.ragHelper.getUserMemory(userId);
			let currentMemory = memoryRecord ? memoryRecord.text : null;

			// 准备提示词
			let prompt;
			if (currentMemory) {
				prompt = `现有记忆：${currentMemory}\n\n记忆相关聊天记录：${message.text}\n\n更新记忆要求：${updatePrompt}`;
			} else {
				prompt = `记忆相关聊天记录：${message.text}\n\n创建记忆要求：${updatePrompt}`;
			}

			// 调用 GPT-4 生成新记忆
			const openai = new OpenAI({
				apiKey: this.chatConfig.secondaryLLM.backend.apiKey,
				baseURL: this.chatConfig.secondaryLLM.backend.baseURL,
			});
			const completion = await openai.chat.completions.create({
				model: this.chatConfig.secondaryLLM.backend.model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: prompt },
				],
				temperature: 0.7,
			});

			const newMemory = completion.choices[0].message.content.trim();

			// 更新记忆
			const success = await this.ragHelper.updateUserMemory(userId, newMemory);

			if (this.chatConfig.debug) {
				console.log("更新用户" + userId + "的记忆：", newMemory);
			}

			if (success) {
				return {
					success: true,
					memory: newMemory,
					isNew: !currentMemory,
				};
			} else {
				throw new Error("RAG后端更新失败");
			}
		} catch (error) {
			console.error("更新用户记忆错误:", error);
			return {
				success: false,
				error: error.message,
			};
		}
	}
}
