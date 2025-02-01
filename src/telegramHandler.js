class TelegramHandler {
	constructor(bot) {
		this.bot = bot;
	}

	async handleMessage(msg) {
		// 预处理消息
		const processedMsg = this.preprocessMessage(msg);

		// 转发到空气读取模块进行判断
		return {
			text: processedMsg.text,
			chatId: msg.chat.id,
			userId: msg.from.id,
			messageId: msg.message_id,
			// 其他必要的上下文信息
		};
	}

	preprocessMessage(msg) {
		// 清理消息文本
		// 处理特殊字符
		// 提取@信息等
		return msg;
	}
}
