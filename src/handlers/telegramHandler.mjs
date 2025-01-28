export class TelegramHandler {
  constructor(config = {}) {
    this.config = {
      // 命令前缀，默认为'/'
      commandPrefix: config.commandPrefix || '/',
      // 是否处理编辑过的消息
      handleEdited: config.handleEdited || false,
      // 是否记录消息历史
      keepHistory: config.keepHistory || true,
      // 每个群组保存的历史消息数量
      historySize: config.historySize || 100,
      ...config
    };
    
    // 存储消息历史的Map，key是chatId
    this.messageHistory = new Map();
  }

  /**
   * 处理传入的消息
   */
  async handleMessage(msg) {
    // 如果消息为空，直接返回
    if (!msg || !msg.text) {
      return null;
    }

    // 预处理消息
    const processedMsg = this.preprocessMessage(msg);
    
    // 更新消息历史
    if (this.config.keepHistory) {
      this.updateMessageHistory(msg.chat.id, processedMsg);
    }
    // 返回整个聊天记录
    return this.getMessageHistory(msg.chat.id);
  }

  /**
   * 预处理消息
   */
  preprocessMessage(msg) {
    const processed = {
      // 基础信息
      messageId: msg.message_id,
      chatId: msg.chat.id,
      chatType: msg.chat.type,
      userId: msg.from.id,
      username: msg.from.username,
      firstName: msg.from.first_name,
      lastName: msg.from.last_name,
      date: msg.date,
      
      // 消息内容
      text: msg.text,
      isCommand: false,
      command: null,
      commandArgs: null,
      
      // 回复信息
      isReply: !!msg.reply_to_message,
      replyTo: msg.reply_to_message,
      
      // 提及信息
      mentions: this.extractMentions(msg),
      
      // 原始消息
      raw: msg
    };

    // 处理命令
    if (msg.text && msg.text.startsWith(this.config.commandPrefix)) {
      const commandParts = msg.text.split(' ');
      processed.isCommand = true;
      processed.command = commandParts[0].substring(1); // 移除前缀
      processed.commandArgs = commandParts.slice(1);
    }

    return processed;
  }

  /**
   * 提取消息中的提及（@用户）
   */
  extractMentions(msg) {
    const mentions = {
      userMentions: [],
      botMentioned: false
    };

    if (msg.entities) {
      msg.entities.forEach(entity => {
        if (entity.type === 'mention') {
          const mention = msg.text.substring(entity.offset, entity.offset + entity.length);
          mentions.userMentions.push(mention);
        }
      });
    }

    // 检查是否提到了机器人
    if (msg.entities && msg.entities.some(entity => 
      entity.type === 'mention' && 
      msg.text.substring(entity.offset, entity.offset + entity.length) === `@${this.config.botUsername}`
    )) {
      mentions.botMentioned = true;
    }

    return mentions;
  }

  /**
   * 更新消息历史
   */
  updateMessageHistory(chatId, message) {
    if (!this.messageHistory.has(chatId)) {
      this.messageHistory.set(chatId, []);
    }

    const history = this.messageHistory.get(chatId);
    history.push(message);

    // 保持历史记录在配置的大小范围内
    if (history.length > this.config.historySize) {
      history.shift();
    }
  }

  /**
   * 获取特定聊天的消息历史
   */
  getMessageHistory(chatId) {
    return this.messageHistory.get(chatId) || [];
  }

  /**
   * 清除特定聊天的消息历史
   */
  clearMessageHistory(chatId) {
    this.messageHistory.delete(chatId);
  }
} 