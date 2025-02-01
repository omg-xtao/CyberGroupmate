import OpenAI from "openai";
import * as fs from "fs/promises";
import * as path from "path";

export class LLMHandler {
	constructor(chatConfig = {}, botActionHelper) {
		this.chatConfig = chatConfig;

		this.botActionHelper = botActionHelper;
		// 初始化OpenAI客户端
		this.openai = new OpenAI({
			apiKey: chatConfig.actionGenerator.backend.apiKey,
			baseURL: chatConfig.actionGenerator.backend.baseURL,
		});
	}

	/**
	 * 生成行动
	 */
	async generateAction(context) {
		try {
			// 准备prompt
			let messages = this.prepareMessages(context);

			// 调用API
			let response = await this.callLLM(messages, context);

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
	processMessageHistoryForLLM(messageContext, withDate = false, emphasizeLastReply = false) {
		let history = messageContext;
		let textHistory = history.map((item) => {
			// 计算时间差
			let timeStr = "";
			if (withDate && item.created_at) {
				const now = Date.now();
				// 将 "2025-01-30 03:38:50.683000" 格式的UTC时间转换为时间戳
				const createdAt = new Date(item.created_at + "Z"); // 添加Z表示这是UTC时间
				const diff = (now - createdAt.getTime()) / 1000; // 转换为秒

				if (diff < 60) {
					timeStr = "刚刚";
				} else if (diff < 3600) {
					timeStr = `${Math.floor(diff / 60)}分钟前`;
				} else if (diff < 86400) {
					timeStr = `${Math.floor(diff / 3600)}小时前`;
				} else {
					timeStr = `${Math.floor(diff / 86400)}天前`;
				}
				timeStr = ` (${timeStr})`;
			}

			// 根据内容类型处理不同的格式
			if (item.content_type === "message") {
				let metadata = item.metadata || {};
				let userIdentifier = `${metadata.from.first_name || ""}${metadata.from.last_name || ""}`;

				// 检查用户是否在黑名单中
				if (this.chatConfig.blacklistUsers?.includes(metadata.from.id)) {
					return "";
				}

				// 处理回复消息
				if (metadata.reply_to_message) {
					let replyMeta = metadata.reply_to_message;
					let replyUserIdentifier = `${replyMeta.from.first_name || ""}${replyMeta.from.last_name || ""}`;
					return `<message id="${item.message_id}" user="${userIdentifier}"${timeStr}><reply_to user="${replyUserIdentifier}">${replyMeta.text}</reply_to>${item.text}</message>`;
				} else {
					return `<message id="${item.message_id}" user="${userIdentifier}"${timeStr}>${item.text}</message>`;
				}
			} else {
				// 处理bot的actions (note, reply, search等)
				// 如果是最后一条消息且是bot reply,则改为bot_latest_reply
				if (
					item.content_type === "reply" &&
					history.indexOf(item) === history.length - 1 &&
					emphasizeLastReply
				) {
					return `<bot_latest_reply${timeStr}>${item.text}</bot_latest_reply>`;
				}
				return `<bot_${item.content_type}${timeStr}>${item.text}</bot_${item.content_type}>`;
			}
		});

		return textHistory.join("\n");
	}

	/**
	 * 准备发送给LLM的消息
	 */
	prepareMessages(context, multiShotPrompt = "") {
		// 添加系统提示词，这里用system role
		let messages = [{ role: "system", content: this.chatConfig.actionGenerator.systemPrompt }];

		//从这里开始用 user role，所有消息先用回车分隔，最后再合并到 user role message 里
		let userRoleMessages = [];

		// 添加近似RAG搜索结果，
		if (context.similarMessage) {
			userRoleMessages.push(
				"<related_notes>\n" +
					this.processMessageHistoryForLLM(context.similarMessage, true) +
					"\n</related_notes>"
			);
		}

		// 添加历史消息
		userRoleMessages.push(
			"<chat_history>\n" +
				this.processMessageHistoryForLLM(context.messageContext, true, true) +
				"\n</chat_history>"
		);

		// 添加可用函数
		userRoleMessages.push(`<function>
<function_call_instructions>
你可以直接输出函数对应的identifier 作为XML Tag以调用函数，tag里包裹JSON格式的参数。一次可以调用多个函数。
</function_call_instructions>
<api identifier="chat____text">
<api.instructions>直接向群内发送消息</api.instructions>
<api.parameters>{"message": "要发送的内容"}</api.parameters>
</api>
<api identifier="chat____reply">
<api.instructions>针对某一条消息进行回复（推荐）</api.instructions>
<api.parameters>{"message_id": "要回复的消息ID", "reply": "回复内容"}</api.parameters>
</api>
<api identifier="chat____note">
<api.instructions>记录有趣的碎碎念或者重要的心理活动、记忆节点</api.instructions>
<api.parameters>{"note": "要记录的内容"}</api.parameters>
</api>
<api identifier="chat____skip">
<api.instructions>当你认为没有必要回复也没有什么值得记录的内容的时候，可以跳过</api.instructions>
<api.parameters>{}</api.parameters>
</api>
<api identifier="chat____search">
<api.instructions>使用语义检索聊天历史</api.instructions>
<api.parameters>{"keyword": "要搜索的多个关键词"}</api.parameters>
</api>
<api identifier="web_____search">
<api.instructions>使用谷歌搜索互联网</api.instructions>
<api.parameters>{"keyword": "要搜索的多个关键词"}</api.parameters>
</api>
</function>

<functioncall____example>
{"参数名字": "参数值"}
</functioncall____example>`);

		// 添加任务
		if (!multiShotPrompt) {
			userRoleMessages.push(`<task>
首先严格按照以下步骤进行思考，每段思考不少于100字：
1. 现在群里有哪些话题？群里可能有多个人同时说话，但是他们讨论的可能是并行的不同话题，注意区分。
2. 当前唤起场景为${context.responseDecision.scene}
3. 哪个话题与你直接有关？如果与你无关，就不要继续回复了
4. 回顾一下之前的对话，特别关注<bot_reply (刚刚)>标签，不要提供相似回应。
5. 是否需要进一步调用函数去获得消息历史或网页搜索结果？
6. 根据你的角色设定，怎么行动才更加自然？

然后模仿functioncall____example，一次可以调用多个函数。
</task>`);
		} else {
			userRoleMessages.push(multiShotPrompt);
		}
		// 添加越狱
		userRoleMessages.push(this.chatConfig.actionGenerator.jailbreakPrompt);

		// 将所有用户消息合并
		messages.push({ role: "user", content: userRoleMessages.join("\n") });

		return messages;
	}

	/**
	 * 调用LLM API
	 */
	async callLLM(messages, context) {
		let completion = await this.openai.chat.completions.create({
			model: this.chatConfig.actionGenerator.backend.model,
			messages: messages,
			temperature: this.chatConfig.actionGenerator.backend.temperature,
			max_tokens: this.chatConfig.actionGenerator.backend.maxTokens,
			//presence_penalty: 0.6,
			//frequency_penalty: 0.6,
			//repetition_penalty: 1,
			//include_reasoning: true,
		});

		// 合并reasoning和content
		let response =
			(completion.choices[0].message?.reasoning ||
				completion.choices[0].message?.reasoning_content ||
				"") + completion.choices[0].message?.content || "";

		if (this.chatConfig.debug) {
			// 保存日志到文件
			let timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			let logContent = [
				// 输入消息
				messages.map((msg) => `--- ${msg.role} ---\n${msg.content}\n`).join("\n"),
				// 分隔线
				"\n=== Response ===\n",
				// 响应内容
				response,
				// 模型
				`model: ${this.chatConfig.actionGenerator.backend.model}`,
			].join("\n");

			// 确保logs目录存在
			await fs.mkdir("logs", { recursive: true });

			// 写入日志文件
			await fs.writeFile(path.join("logs", `${timestamp}.txt`), logContent, "utf-8");
		}
		// 保存碎碎念
		if (this.chatConfig.memoChannelId && this.chatConfig.enableMemo) {
			this.botActionHelper.sendText(
				this.chatConfig.memoChannelId,
				["response:", response, "model:", this.chatConfig.actionGenerator.backend.model].join("\n"),
				false
			);
		}

		return response;
	}

	/**
	 * 处理LLM的响应
	 */
	async processResponse(response, context) {
		// 计算当前调用深度
		context.StackDepth = context?.StackDepth + 1 || 0;

		if (!response) return;

		try {
			// 修改这里的解构赋值语法
			let extractResult = this.extractFunctionCalls(response);
			let functionCalls = extractResult.functionCalls;
			response = extractResult.response;

			for (let call of functionCalls) {
				let { function: funcName, params } = call;

				switch (funcName) {
					case "chat____reply":
						if (!params.message_id || !params.reply) {
							console.warn("回复消息缺少必要参数");
							continue;
						}
						await this.botActionHelper.sendReply(
							context.chatId,
							params.reply,
							params.message_id
						);
						break;

					case "chat____note":
						if (!params.note) {
							console.warn("记录笔记缺少必要参数");
							continue;
						}
						await this.botActionHelper.saveNote(context.chatId, params.note);
						break;

					case "chat____search":
						if (!params.keyword) {
							console.warn("搜索缺少关键词参数");
							continue;
						}
						if (context.StackDepth > this.chatConfig.actionGenerator.maxStackDepth) {
							console.warn("StackDepth超过最大深度，禁止调用可能嵌套的函数");
							continue;
						}
						let result = await this.botActionHelper.search(
							context.chatId,
							params.keyword
						);
						if (this.chatConfig.debug) console.log("history搜索结果：", result);
						await this.handleRAGSearchResults(result, response, context);
						break;
					case "web_____search":
						if (!params.keyword) {
							console.warn("搜索缺少关键词参数");
							continue;
						}
						if (context.StackDepth > this.chatConfig.actionGenerator.maxStackDepth) {
							console.warn("StackDepth超过最大深度，禁止调用可能嵌套的函数");
							continue;
						}
						let webResult = await this.botActionHelper.googleSearch(params.keyword);
						if (this.chatConfig.debug) console.log("web搜索结果：", webResult);
						await this.handleGoogleSearchResults(webResult, response, context);
						break;

					case "chat____text":
						if (!params.message) {
							console.warn("发送消息缺少内容参数");
							continue;
						}
						await this.botActionHelper.sendText(context.chatId, params.message);
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
	extractFunctionCalls(response) {
		// 如果内容为空，返回空数组
		if (!response) {
			return { functionCalls: [], response: "" };
		}

		let functionCalls = [];

		// 定义multiShot函数列表
		const multiShotFunctions = ["chat____search", "web_____search"];

		// 创建匹配所有支持函数的统一正则表达式
		let supportedFunctions = [
			"chat____search",
			"chat____text",
			"chat____reply",
			"chat____note",
			"chat____skip",
			"web_____search",
		];
		let combinedRegex = new RegExp(
			`<(${supportedFunctions.join("|")})>([\\s\\S]*?)<\\/.*?>`,
			"g"
		);

		let match;
		let lastIndex = 0;
		let foundMultiShot = false;

		while ((match = combinedRegex.exec(response)) !== null) {
			let funcName = match[1];
			let params = match[2].trim();

			try {
				// 检查是否是multiShot函数
				if (multiShotFunctions.includes(funcName)) {
					foundMultiShot = true;
					lastIndex = match.index + match[0].length;
				}

				// 如果已经找到multiShot函数，则不再处理后续函数
				if (foundMultiShot && !multiShotFunctions.includes(funcName)) {
					continue;
				}

				// 对于skip函数，不需要参数
				if (funcName === "chat____skip") {
					functionCalls.push({
						function: funcName,
						params: {},
					});
					continue;
				}

				// 解析其他函数的参数
				let parsedParams;
				try {
					parsedParams = JSON.parse(params);
				} catch (e) {
					console.warn(`解析函数 ${funcName} 的参数失败，使用原始字符串:`, e);
					parsedParams = params;
				}

				functionCalls.push({
					function: funcName,
					params: parsedParams,
				});

				// 如果是multiShot函数，立即停止处理后续内容
				if (multiShotFunctions.includes(funcName)) {
					break;
				}
			} catch (error) {
				console.error(`处理函数 ${funcName} 时出错:`, error);
			}
		}

		// 如果找到了multiShot函数，清空该函数后的所有内容
		if (foundMultiShot && lastIndex > 0) {
			response = response.substring(0, lastIndex);
		}

		return { functionCalls, response };
	}

	/**
	 * 处理历史搜索结果
	 */
	async handleRAGSearchResults(searchResults, previousResponse, context) {
		context.similarMessage = "";
		let multiShotPrompt = `<previous_action>${previousResponse}</previous_action>
以上是你之前的行动，下面是搜索结果，请根据搜索结果进行行动，不要重复。
<history_search_results>
${this.processMessageHistoryForLLM(searchResults, true)}
</history_search_results>
`;
		let messages = this.prepareMessages(context, multiShotPrompt);
		let newResponse = await this.callLLM(messages, context);
		return this.processResponse(newResponse, context);
	}

	/**
	 * 处理谷歌搜索结果
	 */
	async handleGoogleSearchResults(searchResults, previousResponse, context) {
		context.similarMessage = "";
		let multiShotPrompt = `<previous_action>${previousResponse}</previous_action>
以上是你之前的行动，下面是搜索结果，请根据搜索结果进行行动，不要重复。
<web_search_results>
${JSON.stringify(searchResults)}
</web_search_results>
`;
		let messages = this.prepareMessages(context, multiShotPrompt);
		let newResponse = await this.callLLM(messages, context);
		return this.processResponse(newResponse, context);
	}
}
