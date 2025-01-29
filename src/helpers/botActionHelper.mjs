export class BotActionHelper {
    constructor(bot, ragHelper) {
        this.bot = bot;
        this.ragHelper = ragHelper;
    }

    async sendText(chatId, content, log = true) {
        await this.bot.sendMessage(chatId, content);
        if (log) await this.ragHelper.saveAction(chatId, content, "text");
    }

    async sendReply(chatId, content, replyToMessageId, log = true) {
        await this.bot.sendMessage(chatId, content, { reply_to_message_id: replyToMessageId });
        if (log) await this.ragHelper.saveAction(chatId, content, "reply", { reply_to_message_id: replyToMessageId });
    }

    async saveNote(chatId, content, messageId) {
        await this.ragHelper.saveAction(chatId, content, "note");
    }

    async search(chatId, keyword) {
        // todo: 实现搜索功能
        return [];
    }
} 