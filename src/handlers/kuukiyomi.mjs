export class KuukiyomiHandler {
  constructor(config = {}) {
    this.config = {
      // 冷却时间（毫秒）
      cooldown: config.cooldown || 1000,
      // 群组消息频率限制（条/分钟）
      groupRateLimit: config.groupRateLimit || 30,
      // 用户消息频率限制（条/分钟）
      userRateLimit: config.userRateLimit || 5,
      // 触发词
      triggerWords: config.triggerWords || [],
      // 忽略词
      ignoreWords: config.ignoreWords || [],
      // 响应概率 (0-1)
      responseRate: config.responseRate || 0.3,
      ...config
    };

    // 存储最后响应时间
    this.lastResponseTime = new Map();
    // 存储消息频率
    this.messageRates = {
      groups: new Map(),
      users: new Map()
    };
  }

  /**
   * 判断是否应该响应消息
   */
  shouldAct(processedMsg) {
    const result = {
      shouldAct: false,
      reason: '',
      decisionType: 'normal'
    };

    try {
      // 1. 检查冷却时间
      if (!this.checkCooldown(processedMsg.chat_id)) {
        result.reason = '冷却时间内';
        return result;
      }

      // 2. 检查频率限制
      if (!this.checkRateLimit(processedMsg)) {
        result.reason = '超过频率限制';
        return result;
      }

      // 5. 检查触发词
      if (this.checkTriggerWords(processedMsg.text)) {
        result.shouldAct = true;
        result.decisionType = 'trigger';
        result.reason = '触发词匹配';
        return result;
      }

      // 6. 检查忽略词
      if (this.checkIgnoreWords(processedMsg.text)) {
        result.reason = '忽略词匹配';
        return result;
      }

      // 7. 随机响应判断
      if (Math.random() < this.config.responseRate) {
        result.shouldAct = true;
        result.decisionType = 'random';
        result.reason = '随机触发';
        return result;
      }

      result.reason = '未满足任何触发条件';
      return result;

    } catch (error) {
      console.error('判断响应时出错:', error);
      result.reason = '处理错误';
      return result;
    }
  }

  /**
   * 检查冷却时间
   */
  checkCooldown(chatId) {
    const now = Date.now();
    const lastResponse = this.lastResponseTime.get(chatId) || 0;
    
    if (now - lastResponse < this.config.cooldown) {
      return false;
    }

    this.lastResponseTime.set(chatId, now);
    return true;
  }

  /**
   * 检查消息频率
   */
  checkRateLimit(msg) {
    const now = Date.now();
    const oneMinute = 60000;

    // 检查群组频率
    if (msg.metadata.chat.type !== 'private') {
      const groupRates = this.messageRates.groups.get(msg.chat_id) || [];
      groupRates.push(now);
      // 只保留最近一分钟的消息
      const recentGroupRates = groupRates.filter(time => now - time < oneMinute);
      this.messageRates.groups.set(msg.chat_id, recentGroupRates);
      
      if (recentGroupRates.length > this.config.groupRateLimit) {
        return false;
      }
    }

    // 检查用户频率
    const userRates = this.messageRates.users.get(msg.metadata.from.id) || [];
    userRates.push(now);
    const recentUserRates = userRates.filter(time => now - time < oneMinute);
    this.messageRates.users.set(msg.metadata.from.id, recentUserRates);

    return recentUserRates.length <= this.config.userRateLimit;
  }

  /**
   * 检查触发词
   */
  checkTriggerWords(text) {
    if (!text || !this.config.triggerWords.length) return false;
    return this.config.triggerWords.some(word => text.includes(word));
  }

  /**
   * 检查忽略词
   */
  checkIgnoreWords(text) {
    if (!text || !this.config.ignoreWords.length) return false;
    return this.config.ignoreWords.some(word => text.includes(word));
  }

  /**
   * 重置特定聊天的冷却时间
   */
  resetCooldown(chatId) {
    this.lastResponseTime.delete(chatId);
  }

  /**
   * 清理过期的频率记录
   */
  cleanupRates() {
    const now = Date.now();
    const oneMinute = 60000;

    for (const [chatId, rates] of this.messageRates.groups) {
      const recentRates = rates.filter(time => now - time < oneMinute);
      if (recentRates.length === 0) {
        this.messageRates.groups.delete(chatId);
      } else {
        this.messageRates.groups.set(chatId, recentRates);
      }
    }

    for (const [userId, rates] of this.messageRates.users) {
      const recentRates = rates.filter(time => now - time < oneMinute);
      if (recentRates.length === 0) {
        this.messageRates.users.delete(userId);
      } else {
        this.messageRates.users.set(userId, recentRates);
      }
    }
  }
} 