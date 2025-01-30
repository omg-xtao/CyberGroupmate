export class BotActionHelper {
    constructor(bot, ragHelper) {
        this.bot = bot;
        this.ragHelper = ragHelper;
    }

    async sendText(chatId, content, log = true) {
        await this.bot.sendMessage(chatId, content);
        if (log) await this.ragHelper.saveAction(chatId, content, "text");
    }

    async setTyping(chatId) {
        await this.bot.sendChatAction(chatId, "typing");
    }

    async sendReply(chatId, content, replyToMessageId, log = true) {
        await this.bot.sendMessage(chatId, content, { reply_to_message_id: replyToMessageId });
        if (log) await this.ragHelper.saveAction(chatId, content, "reply", { reply_to_message_id: replyToMessageId });
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
        const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=${num}`;
        
        try {
          const response = await fetch(url);
          const data = await response.json();
      
          console.log("谷歌搜索：", data);
          
          if (data.items && data.items.length > 0) {
            return data.items.map(item => ({
              title: item.title,
              link: item.link,
              snippet: item.snippet
            }));
          }
          return [];
        } catch (error) {
          console.error('搜索出错:', error);
          return [];
        }
      }
} 