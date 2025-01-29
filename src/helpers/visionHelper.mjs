import OpenAI from 'openai';

export class VisionHelper {
    constructor(config = {}, telegramBot) {
        this.debug = config.debug || false;
        this.telegramBot = telegramBot;
        
        // 初始化 OpenAI 客户端
        this.openai = new OpenAI({
            baseURL: process.env.VISION_OPENAI_BASE_URL,
            apiKey: process.env.VISION_OPENAI_API_KEY,
        });
        
        this.model = process.env.VISION_OPENAI_MODEL || 'gpt-4-vision-preview';
    }

    /**
     * 分析图片并返回描述
     * @param {string} fileId - Telegram 文件 ID
     * @returns {Promise<string>} 图片描述
     */
    async analyzeImage(fileId) {
        try {
            // 1. 从 Telegram 获取文件链接
            const file = await this.telegramBot.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

            // 2. 调用 OpenAI Vision API
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个图片描述助手。请用中文描述图片内容。描述要客观准确，不要加入主观评价。'
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: '请详细描述这张图片' },
                            {
                                type: "image_url",
                                image_url: {
                                  "url": fileUrl
                                },
                            },
                        ]
                    }
                ],
                max_tokens: 300
            });

            if (this.debug) {
                console.log('Vision API 响应:', response);
            }

            // 3. 返回生成的描述
            return response.choices[0]?.message?.content || '无法生成图片描述';

        } catch (error) {
            console.error('图片分析失败:', error);
            throw new Error(`图片分析失败: ${error.message}`);
        }
    }
}