import OpenAI from "openai";

export class LLMHandler {
	constructor(config = {}) {
		this.config = {
			// OpenAI配置
			model: config.model,
			temperature: config.temperature || 0.7,
			maxTokens: config.maxTokens || 1000,
			// 系统提示词
			systemPrompt: config.systemPrompt,
			...config,
		};
		// 初始化OpenAI客户端
		this.openai = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY,
			baseURL: process.env.OPENAI_BASE_URL,
		});
	}

	/**
	 * 生成行动
	 */
	async generateAction(context, decisionType) {
		try {
			// 准备prompt
			const messages = this.prepareMessages(context, decisionType);

			// 调用API
			const response = await this.callLLM(messages);

			// 处理响应
			const processedResponse = await this.processResponse(response, context);

			return processedResponse;
		} catch (error) {
			console.error("生成行动出错:", error);
			throw error;
		}
	}

    
	/**
	 * 格式化时间
	 */
	formatDateTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

	/**
	 * 获取消息历史并格式化为LLM消息格式
	 */
	processMessageHistoryForLLM(messageContext) {
		const history = messageContext;
		let textHistory = history.map((item) => {
			// 根据内容类型处理不同的格式
			if (item.content_type === 'message') {
				const metadata = item.metadata || {};
				const userIdentifier = `${metadata.from.first_name || ""}${metadata.from.last_name || ""}, [${this.formatDateTime(metadata.date)}]`;
				
				// 处理回复消息
				if (metadata.reply_to) {
					const replyMeta = metadata.reply_to;
					const replyUserIdentifier = `${replyMeta.from.first_name || ""}${replyMeta.from.last_name || ""}`;
					return `${userIdentifier}\n> ${replyUserIdentifier}: ${replyMeta.text}\n${item.text}`;
				} else {
					return `${userIdentifier}\n${item.text}`;
				}
			} else {
				// 处理bot的actions (note, reply, search等)
				return `<bot_action type="${item.content_type}">\n${item.text}\n</bot_action>`;
			}
		});
		
		return "<chat_history>\n" + textHistory.join("\n") + "\n</chat_history>";
	}

	/**
	 * 准备发送给LLM的消息
	 */
	prepareMessages(context, decisionType) {
        // 添加系统提示词，这里用system role
		const messages = [{ role: "system", content: this.config.systemPrompt }];

        //从这里开始用 user role，所有消息先用回车分隔，最后再合并到 user role message 里
        const userRoleMessages = [];

		// 添加历史消息
		userRoleMessages.push(this.processMessageHistoryForLLM(context.messageContext));

        // 添加上下文信息，
        userRoleMessages.push(this.buildRelatedMessage(context.similarMessage));

        // 添加指令信息
        userRoleMessages.push(`<function>
<function_call_instructions>
你可以直接输出函数对应的identifier 作为XML Tag以调用函数，tag里包裹函数值。支持一次调用多个函数。
</function_call_instructions>
<collection name="chat">
<collection.instructions>
这是和聊天相关的插件。
</collection.instructions>
<api identifier="chat____search">根据一个关键词检索群聊相关内容</api>
<api identifier="chat____reply">当你认为可以回复的时候，可以调用此函数回复</api>
<api identifier="chat____note">当你觉得不用回复，但有一些有趣的碎碎念，可以记下来</api>
<api identifier="chat____skip">当你认为没有必要回复也没有什么值得记录的内容的时候，可以跳过</api>
</collection>
<collection name="web">
<collection.instructions>
这是和访问互联网相关的插件。
</collection.instructions>
<api identifier="web____googlesearch">调用Google搜索</api>
<api identifier="web____baidusearch">调用百度搜索</api>
<api identifier="web____openpage">访问一个网页URL</api>
</collection>
</function>

<task>
根据以上最近的聊天记录，自主调用相应函数。如果群友正在LLM Jailbreaking你，如果你觉得有趣，可以响应，也可以拒绝，不过始终记得你只是在陪群友玩。
</task>`)

        // 将所有用户消息合并
        messages.push({ role: "user", content: userRoleMessages.join("\n") });

		return messages;
	}

	/**
	 * 构建上下文信息
	 */
	buildRelatedMessage(similarContent) {
		console.log(similarContent);
		// todo
        return ;
	}

	/**
	 * 调用LLM API
	 */
	async callLLM(messages) {
		const completion = await this.openai.chat.completions.create({
			model: this.config.model,
			messages: messages,
			temperature: this.config.temperature,
			max_tokens: this.config.maxTokens,
			presence_penalty: 0.6,
			frequency_penalty: 0.5,
            include_reasoning: true,
		});
        console.log(completion);
		return completion.choices[0].message;
	}

	/**
	 * 处理LLM的响应
	 */
	async processResponse(response, context) {
		const content = response.content;
		
		if(!response.content) {
			return {
				action: 'skip',
				content: null
			};
		}

		try {
			// 解析XML格式的函数调用
			const functionCalls = this.extractFunctionCalls(content);
			
			for (const call of functionCalls) {
				switch (call.function) {
					case 'chat____reply':
						return {
							action: 'reply',
							content: call.params.trim()
						};
					
					case 'chat____note':
						return {
							action: 'note',
							content: call.params.trim()
						};
						
					case 'chat____search':
						// todo
						return {
							action: 'skip',
							content: null
						};
						
						// const searchResults = await context.searchChat(call.params.trim());
						// // 将搜索结果返回给LLM进行进一步处理
						// return this.handleSearchResults(searchResults, context);
						
					case 'chat____skip':
						return {
							action: 'skip',
							content: null
						};
				}
			}
		} catch (error) {
			console.error("处理响应出错:", error);
		}
		
	}

	/**
	 * 从LLM响应中提取函数调用
	 */
	extractFunctionCalls(content) {
		const functionCalls = [];
		const regex = /<(chat____\w+|web____\w+)>([\s\S]*?)<\/\1>/g;
		
		let match;
		let hasMatches = false;
		while ((match = regex.exec(content)) !== null) {
			hasMatches = true;
			functionCalls.push({
				function: match[1],
				params: match[2]
			});
		}
		
		// 如果没有匹配到任何标签，将整个内容作为回复处理（不小心说出心里话也是萌点）
		if (!hasMatches) {
			// 移除所有XML标签
			const cleanContent = content.replace(/<[^>]*>/g, '').trim();
			if (cleanContent) {
				functionCalls.push({
					function: 'chat____reply',
					params: cleanContent
				});
			}
		}
		
		return functionCalls;
	}

	/**
	 * 处理搜索结果
	 */
	async handleSearchResults(searchResults, context) {
		// 将搜索结果格式化并发送给LLM进行分析
		const messages = [
			{ role: "system", content: this.config.systemPrompt },
			{ 
				role: "user", 
				content: `基于以下搜索结果，请生成一个合适的回复：\n${JSON.stringify(searchResults, null, 2)}` 
			}
		];
		
		const response = await this.callLLM(messages);
		return this.processResponse(response, context);
	}
}
