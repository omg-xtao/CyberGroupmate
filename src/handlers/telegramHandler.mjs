import ogs from 'open-graph-scraper';

export class TelegramHandler {
    constructor(config = {}, ragHelper, visionHelper) {
        this.debug = config.debug || false;
        this.ragHelper = ragHelper;
        this.visionHelper = visionHelper;
    }

    /**
     * 解析文本中的 URL 并获取 Open Graph 数据
     * @param {string} text - 包含 URL 的文本
     * @returns {Promise<string>} 解析后的文本
     */
    async parseUrls(text) {
        try {
            // 使用正则表达式匹配 URL
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urls = text.match(urlRegex);
            
            if (!urls) return text;

            let resultText = text;
            
            // 只处理前3个URL
            const urlsToProcess = urls.slice(0, 3);
            
            // 处理每个 URL
            for (const url of urlsToProcess) {
                try {
                    const options = { 
                        url,
                        timeout: 2000, // 2秒超时
                        fetchOptions: {
                            headers: {
                                'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
                            }
                        }
                    };
                    
                    const { result } = await ogs(options);
                    
                    if (result.success) {
                        let ogInfo = '\n[链接预览]\n';
                        if (result.ogTitle) ogInfo += `标题: ${result.ogTitle}\n`;
                        if (result.ogDescription) ogInfo += `描述: ${result.ogDescription}\n`;
                        
                        // 将 URL 替换为 URL + Open Graph 信息
                        resultText = resultText.replace(url, `${url}${ogInfo}`);
                    }
                } catch (urlError) {
                    console.error(`解析 URL 失败: ${url}`, urlError);
                }
            }
            
            return resultText;
        } catch (error) {
            console.error('URL 解析过程出错:', error);
            return text;
        }
    }

    /**
     * 处理Telegram消息
     * @param {Object} telegramMsg - Telegram原始消息对象
     * @returns {Object|null} 标准化的消息对象
     */
    async handleMessage(telegramMsg) {
        try {
            // 基础消息检查
            if (!telegramMsg || !telegramMsg.text && !telegramMsg.photo) {
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
                        username: telegramMsg.reply_to_message.from.username || '',
                        first_name: telegramMsg.reply_to_message.from.first_name || '',
                        last_name: telegramMsg.reply_to_message.from.last_name || '',
                    },
                };
            }

            // 处理转发消息
            if (telegramMsg.forward_from) {
                standardizedMsg.metadata.forward_from = {
                    id: telegramMsg.forward_from.id,
                    is_bot: telegramMsg.forward_from.is_bot,
                    username: telegramMsg.forward_from.username || '',
                    first_name: telegramMsg.forward_from.first_name || '',
                    last_name: telegramMsg.forward_from.last_name || '',
                };
                standardizedMsg.metadata.forward_date = new Date(telegramMsg.forward_date * 1000).toISOString();
            }

            // 处理媒体消息（如果有）
            if (telegramMsg.photo || telegramMsg.video || telegramMsg.document) {
                standardizedMsg.metadata.has_media = true;
                standardizedMsg.metadata.media_type = telegramMsg.photo ? 'photo' : 
                                                    telegramMsg.video ? 'video' : 
                                                    'document';
                
                // 即时处理：优先使用 caption，如果没有则使用默认文本
                standardizedMsg.text = telegramMsg.caption || '[图片]';
                standardizedMsg.metadata.has_caption = !!telegramMsg.caption;

                // 如果是图片，记录图片信息供异步处理使用
                if (telegramMsg.photo) {
                    // 获取最高质量的图片
                    const photo = telegramMsg.photo[telegramMsg.photo.length - 1];
                    standardizedMsg.metadata.media = {
                        file_id: photo.file_id,
                        file_unique_id: photo.file_unique_id,
                        width: photo.width,
                        height: photo.height,
                        file_size: photo.file_size
                    };
                    
                    // 异步处理图片
                    this.processImageAsync(standardizedMsg);
                }
            }

            // 在返回之前解析消息中的 URL
            if (standardizedMsg.text) {
                standardizedMsg.text = await this.parseUrls(standardizedMsg.text);
            }

            return standardizedMsg;
        } catch (error) {
            console.error('处理消息时出错:', error);
            return null;
        }
    }

    /**
     * 异步处理图片
     * @param {Object} standardizedMsg - 标准化的消息对象
     */
    async processImageAsync(standardizedMsg) {
        try {
            // 获取图片描述
            const imageDescription = await this.visionHelper.analyzeImage(standardizedMsg.metadata.media.file_id);
            
            // 构建更新后的消息内容
            let updatedText;
            if (standardizedMsg.metadata.has_caption) {
                // 如果有 caption，保留原文并添加图片描述
                updatedText = `${standardizedMsg.text}\n[图片描述: ${imageDescription}]`;
            } else {
                // 如果没有 caption（即原文是[图片]），则只使用图片描述
                updatedText = `[图片描述: ${imageDescription}]`;
            }

            // 使用 RAG 助手更新消息
            await this.ragHelper.updateMessage({
                ...standardizedMsg,
                text: updatedText,
                metadata: {
                    ...standardizedMsg.metadata,
                    image_description: imageDescription,
                    processed_at: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('异步处理图片失败:', error);
            // 即使处理失败也要更新 RAG，记录错误信息
            await this.ragHelper.updateMessage({
                ...standardizedMsg,
                metadata: {
                    ...standardizedMsg.metadata,
                    image_analysis_error: error.message,
                    processed_at: new Date().toISOString()
                }
            });
        }
    }
}
