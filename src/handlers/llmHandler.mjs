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
			// 历史消息数量
			maxHistory: config.maxHistory || 5,
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
	processMessageHistoryForLLM(processedMsg) {
		const history = processedMsg;
		let textHistory = history.slice(-this.config.maxHistory).map((msg) => {
			let content = "";

			// 构建用户标识
			const userIdentifier = `${msg.firstName || ""}${msg.lastName || ""}, [${this.formatDateTime(msg.date)}]`;

			// 如果有回复消息
			if (msg.replyTo && msg.replyTo.text) {
				const replyUserIdentifier = `${msg.replyTo.firstName || ""}${msg.replyTo.lastName || ""}`;
				content = `${userIdentifier}\n> ${replyUserIdentifier}: ${msg.replyTo.text}\n${msg.text}`;
			} else {
				content = `${userIdentifier}\n${msg.text}`;
			}

			return content;
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
你可以直接输出函数对应的identifier 作为XML Tag以调用函数，里面包裹函数参数值
</function_call_instructions>
<collection name="chat">
<collection.instructions>
这是和聊天相关的插件。
</collection.instructions>
<api identifier="chat____search">根据一个关键词检索群聊相关内容</api>
<api identifier="chat____reply">当你认为可以回复的时候，可以调用此函数回复</api>
<api identifier="chat____note">当你觉得不用回复，但可以记录当时的想法</api>
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

        return ;
		const context = [];

		// 添加响应类型相关信息
		switch (decisionType) {
			case "command":
				context.push(`用户使用了命令: ${processedMsg.command}`);
				break;
			case "mention":
				context.push("用户直接提到了你");
				break;
			case "trigger":
				context.push("用户使用了触发词");
				break;
			case "random":
				context.push("这是一个随机响应场景");
				break;
		}

		// 添加聊天类型信息
		context.push(`这是在${processedMsg.chatType === "private" ? "私聊" : "群聊"}中`);

		return context.join("\n");
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
		// TODO: 处理LLM的响应
		console.log(response);
		return "";
	}

	/**
	 * 处理函数调用
	 */
	async handleFunctionCall(functionCall, processedMsg) {
		// TODO: 实现具体的函数调用逻辑
		console.log("Function call:", functionCall);
		return {
			type: "function_result",
			content: "函数调用结果",
			functionName: functionCall.name,
		};
	}
}
