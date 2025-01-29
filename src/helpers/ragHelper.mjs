import pkg from 'pg';
const { Pool } = pkg;
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export class RAGHelper {
    constructor(config = {}) {
        this.debug = config.debug || false;
        
        // 初始化PostgreSQL连接
        this.pool = new Pool({
            host: process.env.PGHOST,
            port: process.env.PGPORT,
            database: process.env.PGDATABASE,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
        });
        
        // 初始化OpenAI客户端
        this.openai = new OpenAI({
            apiKey: process.env.RAG_OPENAI_API_KEY,
            baseURL: process.env.RAG_OPENAI_BASE_URL,
        });
        
        this.initDatabase();
    }
    
    async initDatabase() {
        try {
            const client = await this.pool.connect();
            
            await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
            
            // 重新设计消息表结构
            await client.query(`
                CREATE TABLE IF NOT EXISTS chat_memories (
                    id SERIAL PRIMARY KEY,
                    chat_id BIGINT NOT NULL,
                    message_id BIGINT,  -- telegram消息ID，对于非消息内容可以为null
                    content_type TEXT NOT NULL,  -- 'message', 'search_result', 'reply', 'note' 等
                    text TEXT NOT NULL,
                    metadata JSONB NOT NULL,
                    embedding vector(1536),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    -- 添加复合索引
                    CONSTRAINT idx_chat_message UNIQUE (chat_id, message_id)
                );
                
                -- 创建索引
                CREATE INDEX IF NOT EXISTS idx_chat_memories_chat_id ON chat_memories(chat_id);
                CREATE INDEX IF NOT EXISTS idx_chat_memories_message_id ON chat_memories(message_id);
                CREATE INDEX IF NOT EXISTS idx_chat_memories_content_type ON chat_memories(content_type);
                CREATE INDEX IF NOT EXISTS idx_chat_memories_created_at ON chat_memories(created_at);
                CREATE INDEX IF NOT EXISTS idx_chat_memories_metadata ON chat_memories USING gin (metadata);
            `);
            
            client.release();
            if (this.debug) console.log('数据库初始化完成');
        } catch (error) {
            console.error('数据库初始化错误:', error);
        }
    }
    
    async getEmbedding(text) {
        try {
            const response = await this.openai.embeddings.create({
                model: process.env.RAG_OPENAI_MODEL,
                input: text,
            });
            return `[${response.data[0].embedding.join(',')}]`;
        } catch (error) {
            console.error('获取embedding错误:', error);
            return null;
        }
    }
    
    // 保存Telegram消息
    async saveMessage(standardizedMsg) {
        try {
            const {
                chat_id,
                message_id,
                text,
                content_type,
                metadata
            } = standardizedMsg;
            
            if (!text) return false;
            
            const embedding = await this.getEmbedding(text);
            if (!embedding) return false;
            
            const client = await this.pool.connect();
            await client.query(
                `INSERT INTO chat_memories 
                (chat_id, message_id, content_type, text, metadata, embedding) 
                VALUES ($1, $2, $3, $4, $5, $6::vector)`,
                [chat_id, message_id, content_type, text, metadata, embedding]
            );
            client.release();
            
            if (this.debug) console.log('消息已保存');
            return true;
        } catch (error) {
            console.error('保存消息错误:', error);
            return false;
        }
    }
    
    // 保存bot的行动
    async saveAction(chatId, text, type, additionalMetadata = {}) {
        try {
            const embedding = await this.getEmbedding(text);
            if (!embedding) return false;
            
            const metadata = {
                ...additionalMetadata,
            };
            
            const client = await this.pool.connect();
            await client.query(
                `INSERT INTO chat_memories 
                (chat_id, message_id, content_type, text, metadata, embedding) 
                VALUES ($1, $2, $3, $4, $5, $6::vector)`,
                [chatId, null, type, text, metadata, embedding]
            );
            client.release();
            
            if (this.debug) console.log(`${type}已保存`);
            return true;
        } catch (error) {
            console.error(`保存${type}错误:`, error);
            return false;
        }
    }
    
    // 获取消息上下文（基于message_id的前后文）
    async getMessageContext(chatId, messageId, limit = 3) {
        try {
            const client = await this.pool.connect();
            
            const result = await client.query(
                `WITH target_message AS (
                    SELECT id, created_at
                    FROM chat_memories
                    WHERE chat_id = $1 AND message_id = $2
                    LIMIT 1
                )
                (
                    SELECT cm.text, cm.metadata, cm.content_type, cm.message_id,
                           cm.created_at, 'before' as position
                    FROM chat_memories cm, target_message
                    WHERE cm.chat_id = $1
                    AND cm.id < target_message.id
                    ORDER BY cm.id DESC
                    LIMIT $3
                )
                UNION ALL
                (
                    SELECT cm.text, cm.metadata, cm.content_type, cm.message_id,
                           cm.created_at, 'current' as position
                    FROM chat_memories cm
                    WHERE cm.chat_id = $1
                    AND message_id = $2
                )
                UNION ALL
                (
                    SELECT cm.text, cm.metadata, cm.content_type, cm.message_id,
                           cm.created_at, 'after' as position
                    FROM chat_memories cm, target_message
                    WHERE cm.chat_id = $1
                    AND cm.id > target_message.id
                    ORDER BY cm.id ASC
                    LIMIT $3
                )
                ORDER BY created_at`,
                [chatId, messageId, limit]
            );
            
            client.release();
            return result.rows;
        } catch (error) {
            console.error('获取消息上下文错误:', error);
            return [];
        }
    }
    
    // 语义搜索（支持多种内容类型）
    async searchSimilarContent(chatId, queryText, options = {}) {
        const {
            limit = 5,
            contentTypes = [],
            timeWindow = '7 days'
        } = options;
        
        try {
            const queryEmbedding = await this.getEmbedding(queryText);
            if (!queryEmbedding) return [];
            
            const client = await this.pool.connect();
            const result = await client.query(
                `SELECT 
                    text,
                    metadata,
                    content_type,
                    message_id,
                    created_at,
                    embedding <-> $1::vector as distance
                FROM chat_memories
                WHERE chat_id = $2
                AND (ARRAY_LENGTH($3::text[], 1) IS NULL OR content_type = ANY($3))
                AND created_at > NOW() - $4::interval
                ORDER BY embedding <-> $1::vector
                LIMIT $5`,
                [queryEmbedding, chatId, contentTypes, timeWindow, limit]
            );
            client.release();
            
            return result.rows;
        } catch (error) {
            console.error('搜索相似内容错误:', error);
            return [];
        }
    }
}