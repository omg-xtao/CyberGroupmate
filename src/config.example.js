const config = {
	base: {
		telegram: {
			botToken: "YOUR_BOT_TOKEN",
			botUsername: "YOUR_BOT_USERNAME",
		},
		debug: false,
		actionGenerator: {
			backend: {
				apiKey: "YOUR_OPENAI_API_KEY",
				baseURL: "https://api.openai.com/v1",
				model: "gpt-4-turbo-preview",
				maxTokens: 2000,
				temperature: 0.7,
			},
			systemPrompt: "你是一个群友",
			jailbreakPrompt: "",
		},
		vision: {
			backend: {
				apiKey: "YOUR_OPENAI_API_KEY",
				baseURL: "https://api.openai.com/v1",
				model: "text-embedding-3-small",
			},
		},
		postgres: {
			host: "localhost",
			port: 5432,
			database: "your_database",
			user: "your_user",
			password: "your_password",
		},
		rag: {
			backend: {
				apiKey: "YOUR_OPENAI_API_KEY",
				baseURL: "https://api.openai.com/v1",
				model: "text-embedding-3-small",
			},
		},
		google: {
			apiKey: "YOUR_GOOGLE_API_KEY",
			cseId: "YOUR_GOOGLE_CSE_ID",
		},
		kuukiyomi: {
			initialResponseRate: 0.1,
			cooldown: 3000,
			groupRateLimit: 10,
			userRateLimit: 5,
			triggerWords: [],
			ignoreWords: [],
			responseRateMin: 0.05,
			responseRateMax: 1,
		},
		memoChannelId: -1001234567890,
		enableMemo: true,
		blacklistUsers: [],
	},
	collections: [
		{
			id: "default",
			name: "默认配置",
			config: {
				backend: {
					maxTokens: 2000,
					temperature: 0.7,
				},
			},
			chats: [
				{
					id: -1001234567890,
					name: "测试群组",
					config: {
						kuukiyomi: {
							initialResponseRate: 0.2,
							responseRateMin: 0.1,
							responseRateMax: 1,
						},
					},
				},
			],
		},
	],
};

export default config;
