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
			// 响应概率范围（0-1）
			responseRateMax: config.responseRateMax || 0.5,
			responseRateMin: config.responseRateMin || 0.1,
			// 当前响应概率
			currentResponseRate: config.initialResponseRate || 0.1,
			...config,
		};

		// 存储最后响应时间
		this.lastResponseTime = new Map();
		// 存储消息频率
		this.messageRates = {
			groups: new Map(),
			users: new Map(),
		};

		// 添加新的状态跟踪
		this.stats = {
			mentionCount: 0,        // 被提及次数
			triggerWordCount: 0,    // 触发词出现次数
			lastInteractionTime: Date.now(),  // 上次交互时间
		};
		
		// 响应率调整参数
		this.rateAdjustment = {
			mentionMultiplier: 0.1,      // 每次被提及增加的基础值
			triggerWordMultiplier: 0.1,  // 每次触发词出现增加的基础值
			decayRate: 0.1,              // 每分钟衰减率
			decayInterval: 10000,         // 衰减检查间隔（毫秒）
		};

		// 启动衰减计时器
		this.startDecayTimer();
	}

	/**
	 * 判断是否应该响应消息
	 */
	shouldAct(processedMsg) {
		const result = {
			shouldAct: false,
			reason: "",
			decisionType: "normal",
		};

		try {
			console.log("当前响应概率为：" + this.config.currentResponseRate);

			if(processedMsg.metadata.chat.type == "private") {
				this.stats.mentionCount++;
				this.stats.lastInteractionTime = Date.now(); // 更新主动交互时间
				result.shouldAct = true;
				result.decisionType = "private";
				result.scene = "当前唤起场景为私聊";
				this.adjustResponseRate(); // 调整响应率
				return result;
			}

			// 优先 检查是否被提及或回复
			if (processedMsg.metadata.reply_to_message?.from?.id == this.config.botId || 
				processedMsg.text?.includes(`@${this.config.botUsername}`)) {
				this.stats.mentionCount++;
				this.stats.lastInteractionTime = Date.now(); // 更新主动交互时间
				result.shouldAct = true;
				result.decisionType = "mention";
				result.scene = "当前唤起场景为被提及或回复";
				this.adjustResponseRate(); // 调整响应率
				return result;
			}

			// 优先 触发词
			const matchedTriggerWord = this.checkTriggerWords(processedMsg.text);
			if (matchedTriggerWord) {
				this.stats.triggerWordCount++;
				this.stats.lastInteractionTime = Date.now(); // 更新主动交互时间
				result.shouldAct = true;
				result.decisionType = "trigger";
				result.scene = `当前唤起场景为触发词匹配："${matchedTriggerWord}"`;
				this.adjustResponseRate(); // 调整响应率
				return result;
			}

			// 1. 检查冷却时间
			if (!this.checkCooldown(processedMsg.chat_id)) {
				result.scene = "冷却时间内";
				return result;
			}

			// 2. 检查频率限制
			if (!this.checkRateLimit(processedMsg)) {
				result.scene = "超过频率限制";
				return result;
			}

			// 5. 检查忽略词
			if (this.checkIgnoreWords(processedMsg.text)) {
				result.scene = "忽略词匹配";
				return result;
			}

			// 6. 随机响应判断
			if (Math.random() < this.config.currentResponseRate) {
				result.shouldAct = true;
				result.decisionType = "random";
				result.scene = "当前唤起场景为随机触发，请谨慎发言，避免打扰。";
				return result;
			}

			result.scene = "未满足任何触发条件";
			return result;
		} catch (error) {
			console.error("判断响应时出错:", error);
			result.scene = "处理错误";
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
		if (msg.metadata.chat.type !== "private") {
			const groupRates = this.messageRates.groups.get(msg.chat_id) || [];
			groupRates.push(now);
			// 只保留最近一分钟的消息
			const recentGroupRates = groupRates.filter((time) => now - time < oneMinute);
			this.messageRates.groups.set(msg.chat_id, recentGroupRates);

			if (recentGroupRates.length > this.config.groupRateLimit) {
				return false;
			}
		}

		// 检查用户频率
		const userRates = this.messageRates.users.get(msg.metadata.from.id) || [];
		userRates.push(now);
		const recentUserRates = userRates.filter((time) => now - time < oneMinute);
		this.messageRates.users.set(msg.metadata.from.id, recentUserRates);

		return recentUserRates.length <= this.config.userRateLimit;
	}

	/**
	 * 检查触发词
	 */
	checkTriggerWords(text) {
		if (!text || !this.config.triggerWords.length) return false;
		const matchedWord = this.config.triggerWords.find((word) => text.includes(word));
		return matchedWord || false;
	}

	/**
	 * 检查忽略词
	 */
	checkIgnoreWords(text) {
		if (!text || !this.config.ignoreWords.length) return false;
		return this.config.ignoreWords.some((word) => text.includes(word));
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
			const recentRates = rates.filter((time) => now - time < oneMinute);
			if (recentRates.length === 0) {
				this.messageRates.groups.delete(chatId);
			} else {
				this.messageRates.groups.set(chatId, recentRates);
			}
		}

		for (const [userId, rates] of this.messageRates.users) {
			const recentRates = rates.filter((time) => now - time < oneMinute);
			if (recentRates.length === 0) {
				this.messageRates.users.delete(userId);
			} else {
				this.messageRates.users.set(userId, recentRates);
			}
		}
	}

	// 添加新方法：启动衰减计时器
	startDecayTimer() {
		setInterval(() => {
			this.adjustResponseRate();
		}, this.rateAdjustment.decayInterval);
	}

	// 添加新方法：计算响应率
	calculateNewResponseRate() {
		const timeSinceLastInteraction = (Date.now() - this.stats.lastInteractionTime) / 60000; // 转换为分钟
		const decayFactor = Math.max(0, 1 - (timeSinceLastInteraction * this.rateAdjustment.decayRate));
		
		// 如果当前响应率已经降到最低，并且有新的主动交互，直接提升到最高响应率
		if (this.config.currentResponseRate <= this.config.responseRateMin && 
			(this.stats.mentionCount > 0 || this.stats.triggerWordCount > 0)) {
			return this.config.responseRateMax;
		}
		
		let newRate = this.config.currentResponseRate;
		
		// 根据统计数据调整响应率
		newRate += this.stats.mentionCount * this.rateAdjustment.mentionMultiplier;
		newRate += this.stats.triggerWordCount * this.rateAdjustment.triggerWordMultiplier;
		
		// 应用衰减
		newRate *= decayFactor;
		
		// 确保在允许范围内
		return Math.min(Math.max(newRate, this.config.responseRateMin), this.config.responseRateMax);
	}

	// 添加新方法：调整响应率
	adjustResponseRate() {
		this.config.currentResponseRate = this.calculateNewResponseRate();
		
		// 重置计数器
		this.stats.mentionCount = 0;
		this.stats.triggerWordCount = 0;
	}
}
