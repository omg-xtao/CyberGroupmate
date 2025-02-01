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

	async saveNote(chatId, content, messageId) {
		await this.ragHelper.saveAction(chatId, content, "note");
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
}
