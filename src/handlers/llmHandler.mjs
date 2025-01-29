import OpenAI from "openai";
import * as fs from 'fs/promises';
import * as path from 'path';

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
		this.botActionHelper = config.botActionHelper;
		// 初始化OpenAI客户端
		this.openai = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY,
			baseURL: process.env.OPENAI_BASE_URL,
		});
	}

	/**
	 * 生成行动
	 */
	async generateAction(context) {
		try {
			// 准备prompt
			const messages = this.prepareMessages(context);

			// 调用API
			const response = await this.callLLM(messages);
			
			// 保存日志到文件
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const logContent = [
				// 输入消息
				messages.map(msg => 
					`--- ${msg.role} ---\n${msg.content}\n`
				).join('\n'),
				// 分隔线
				'\n=== Response ===\n',
				// 响应内容
				`--- reasoning ---\n${response.reasoning || 'N/A'}\n`,
				`--- content ---\n${response.content || 'N/A'}\n`
			].join('\n');
			
			// 确保logs目录存在
			await fs.mkdir('logs', { recursive: true });
			
			// 写入日志文件
			await fs.writeFile(
				path.join('logs', `${timestamp}.txt`),
				logContent,
				'utf-8'
			);

			// 处理响应
			await this.processResponse(response, context);

			return response;
		} catch (error) {
			console.error("生成行动出错:", error);
			throw error;
		}
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
				const userIdentifier = `${metadata.from.first_name || ""}${metadata.from.last_name || ""}`;
				
				// 处理回复消息
				if (metadata.reply_to_message) {
					const replyMeta = metadata.reply_to_message;
					const replyUserIdentifier = `${replyMeta.from.first_name || ""}${replyMeta.from.last_name || ""}`;
					return `<message id="${item.message_id}" user="${userIdentifier}"><reply_to id="${replyMeta.message_id}" user="${replyUserIdentifier}">${replyMeta.text}</reply_to>${item.text}</message>`;
				} else {
					return `<message id="${item.message_id}" user="${userIdentifier}">${item.text}</message>`;
				}
			} else {
				// 处理bot的actions (note, reply, search等)
				return `<bot_action type="${item.content_type}">${item.text}</bot_action>`;
			}
		});
		
		return "<chat_history>\n" + textHistory.join("\n") + "\n</chat_history>";
	}

	/**
	 * 准备发送给LLM的消息
	 */
	prepareMessages(context) {
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
你可以直接输出函数对应的identifier 作为XML Tag以调用函数，tag里包裹JSON格式的参数。一次可以调用多个函数。
</function_call_instructions>
<collection name="chat">
<collection.instructions>
这是和聊天相关的插件。
</collection.instructions>
<api identifier="chat____search">
<api.instructions>根据一个关键词检索群聊相关内容</api.instructions>
<api.parameters>{"keyword": "要搜索的关键词"}</api.parameters>
</api>
<api identifier="chat____text">
<api.instructions>直接向群内发送消息</api.instructions>
<api.parameters>{"message": "要发送的内容"}</api.parameters>
</api>
<api identifier="chat____reply">
<api.instructions>针对某一条消息进行回复（推荐）</api.instructions>
<api.parameters>{"message_id": "要回复的消息ID", "reply": "回复内容"}</api.parameters>
</api>
<api identifier="chat____note">
<api.instructions>记录有趣的碎碎念</api.instructions>
<api.parameters>{"note": "要记录的内容"}</api.parameters>
</api>
<api identifier="chat____skip">
<api.instructions>当你认为没有必要回复也没有什么值得记录的内容的时候，可以跳过</api.instructions>
<api.parameters>{}</api.parameters>
</api>
</collection>
</function>

<functioncall____example>
{"参数名字": "参数值"}
</functioncall____example>

<task>
根据以上最近的聊天记录，注意观察bot_action标签，不要重复。模仿functioncall____example，自主调用相应一个或多个函数。
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
			frequency_penalty: 0.6,
			repetition_penalty: 1,
            include_reasoning: true,
		});
        if(this.config.debug) {
			console.log("Response Content:", completion.choices[0].message.content);
			console.log("Response Reason:", completion.choices[0].message.reasoning);
		}
		return completion.choices[0].message;
	}

	/**
	 * 处理LLM的响应
	 */
	async processResponse(response, context) {
		// 将reasoning和content合并，允许在reasoning里输出函数调用
		const content = response.reasoning + "\n" + response.content;
		
		if(!content) return;

		try {
			const functionCalls = this.extractFunctionCalls(content);
			
			for (const call of functionCalls) {
				const { function: funcName, params } = call;
				
				switch (funcName) {
					case 'chat____reply':
						if (!params.message_id || !params.reply) {
							console.warn('回复消息缺少必要参数');
							continue;
						}
						await this.botActionHelper.sendReply(
							context.chatId,
							params.reply,
							params.message_id
						);
						break;
					
					case 'chat____note':
						if (!params.note) {
							console.warn('记录笔记缺少必要参数');
							continue;
						}
						await this.botActionHelper.saveNote(
							context.chatId,
							params.note,
						);
						break;
						
					case 'chat____search':
						if (!params.keyword) {
							console.warn('搜索缺少关键词参数');
							continue;
						}
						await this.botActionHelper.search(context.chatId, params.keyword);
						break;
						
					case 'chat____text':
						if (!params.message) {
							console.warn('发送消息缺少内容参数');
							continue;
						}
						await this.botActionHelper.sendText(
							context.chatId,
							params.message,
						);
						break;
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
		// 如果内容为空，返回空数组
		if (!content) {
			return [];
		}

		const functionCalls = [];
		
		// 使用简单的XML标签匹配正则，只匹配开始标签
		const tagRegex = /<([^>]+)>/g;
		let match;
		let position = 0;
		
		while ((match = tagRegex.exec(content)) !== null) {
			const tagName = match[1];
			// 只处理我们支持的函数名
			if (!tagName.startsWith('chat____')) {
				continue;
			}
			
			// 构建结束标签
			const endTag = `</${tagName}>`;
			// 找到结束标签的位置
			const endPosition = content.indexOf(endTag, match.index);
			if (endPosition === -1) continue;
			
			// 提取标签内的内容
			const params = content.slice(match.index + match[0].length, endPosition).trim();
			
			try {
				// 对于skip函数，不需要参数
				if (tagName === 'chat____skip') {
					functionCalls.push({
						function: tagName,
						params: {}
					});
					continue;
				}
				
				// 尝试解析JSON参数
				let parsedParams;
				try {
					parsedParams = JSON.parse(params);
				} catch (e) {
					// 如果JSON解析失败，就直接使用原始字符串
					parsedParams = params;
				}
				
				functionCalls.push({
					function: tagName,
					params: parsedParams
				});
			} catch (error) {
				console.error(`解析函数 ${tagName} 的参数时出错:`, error);
			}
			
			// 更新下一次搜索的起始位置
			tagRegex.lastIndex = endPosition + endTag.length;
		}
		
		if(this.config.debug) console.log(functionCalls);
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
