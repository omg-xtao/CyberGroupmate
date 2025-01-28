export class TelegramHandler {
    constructor(config = {}) {
        this.botUsername = config.botUsername;
        this.debug = config.debug || false;
    }

    /**
     * 处理Telegram消息
     * @param {Object} telegramMsg - Telegram原始消息对象
     * @returns {Object|null} 标准化的消息对象
     */
    async handleMessage(telegramMsg) {
        try {
            // 基础消息检查
            if (!telegramMsg || !telegramMsg.text) {
                return null;
            }

            // 如果是机器人自己的消息则忽略
            if (telegramMsg.from?.username === this.botUsername) {
                return null;
            }

            // 标准化消息格式
            const standardizedMsg = {
                // 基础字段
                chat_id: telegramMsg.chat.id,
                message_id: telegramMsg.message_id,
                content_type: 'message',
                text: telegramMsg.text,

                // 元数据
                metadata: {
                    from: {
                        id: telegramMsg.from.id,
                        is_bot: telegramMsg.from.is_bot,
                        first_name: telegramMsg.from.first_name,
                        last_name: telegramMsg.from.last_name,
                        username: telegramMsg.from.username,
                        language_code: telegramMsg.from.language_code,
                    },
                    chat: {
                        id: telegramMsg.chat.id,
                        type: telegramMsg.chat.type,
                        title: telegramMsg.chat.title,
                    },
                    date: new Date(telegramMsg.date * 1000).toISOString(),
                    message_thread_id: telegramMsg.message_thread_id,
                },
            };

            // 处理回复消息
            if (telegramMsg.reply_to_message) {
                standardizedMsg.metadata.reply_to_message = {
                    message_id: telegramMsg.reply_to_message.message_id,
                    text: telegramMsg.reply_to_message.text,
                    from: {
                        id: telegramMsg.reply_to_message.from.id,
                        is_bot: telegramMsg.reply_to_message.from.is_bot,
                        username: telegramMsg.reply_to_message.from.username,
                    },
                };
            }

            // 处理转发消息
            if (telegramMsg.forward_from) {
                standardizedMsg.metadata.forward_from = {
                    id: telegramMsg.forward_from.id,
                    is_bot: telegramMsg.forward_from.is_bot,
                    first_name: telegramMsg.forward_from.first_name,
                    username: telegramMsg.forward_from.username,
                };
                standardizedMsg.metadata.forward_date = new Date(telegramMsg.forward_date * 1000).toISOString();
            }

            // 处理媒体消息（如果有）
            if (telegramMsg.photo || telegramMsg.video || telegramMsg.document) {
                standardizedMsg.metadata.has_media = true;
                standardizedMsg.metadata.media_type = telegramMsg.photo ? 'photo' : 
                                                    telegramMsg.video ? 'video' : 
                                                    'document';
            }

            if (this.debug) {
                console.log('标准化后的消息:', standardizedMsg);
            }

            return standardizedMsg;
        } catch (error) {
            console.error('处理消息时出错:', error);
            return null;
        }
    }
}
