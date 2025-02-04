class StickerHelper {
	constructor(config, bot) {
		this.config = config;
		this.bot = bot;
		this.stickerMap = new Map(); // emoji -> sticker file_ids
		this.initialize();
	}

	async initialize() {
		try {
			for (const setName of this.config.availableStickerSets) {
				const stickerSet = await this.bot.getStickerSet(setName);
				for (const sticker of stickerSet.stickers) {
					if (!sticker.emoji) continue;

					// 一个emoji可能对应多个sticker
					if (!this.stickerMap.has(sticker.emoji)) {
						this.stickerMap.set(sticker.emoji, []);
					}
					this.stickerMap.get(sticker.emoji).push(sticker.file_id);
				}
			}
			console.log(`已加载 ${this.stickerMap.size} 个不同emoji的贴纸`);
		} catch (error) {
			console.error("加载贴纸集时出错:", error);
		}
	}

	getAvailableEmojis() {
		return Array.from(this.stickerMap.keys());
	}

	getRandomSticker(emoji) {
		const stickers = this.stickerMap.get(emoji);
		if (!stickers || stickers.length === 0) return null;

		const randomIndex = Math.floor(Math.random() * stickers.length);
		return stickers[randomIndex];
	}
}

export { StickerHelper };
