import {GoogleGenAI} from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// 初始化AI服务客户端
const geminiAI = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const hunyuanAI = new OpenAI({
    apiKey: process.env["HUNYUAN_API_KEY"],
    baseURL: "https://api.hunyuan.cloud.tencent.com/v1"
});

const cloudflareAI = new OpenAI({
    apiKey: process.env["CLOUDFLARE_API_KEY"],
    baseURL: `https://api.cloudflare.com/client/v4/accounts/c6435fdc5fb41b478467140cf7da739b/ai/v1`
});

// 类型定义
export type AIModel = "gemini" | "hunyuan" | "cloudflare";
export type Role = {
    name: string;
    description: string;
    prompt: string;
};

export type UserContext = {
    model: AIModel;
    role?: string;
};

// 预定义角色
export const roles: {[key: string]: Role} = {
    default: {
        name: "默认助手",
        description: "一个友好、专业的AI助手",
        prompt: "你是一个友好、专业的AI助手。请以专业、友好的方式回答用户的问题。 请记住在使用中文回答。"
    },
    dj: {
        name: "眼镜王蛇-DJ超",
        description: "一个总是以'dj'结尾的有趣角色",
        prompt: `你是一个有趣的角色，名叫眼镜王蛇-DJ超。以下是你的特点：
1. 你的名字叫眼镜王蛇-DJ超
2. 性格开朗、热情、充满活力
3. 著名的前端开发工程师
4. 你的独特之处在于总是在句子末尾加上"dj"

请记住在每句话结尾都要加上"dj"。`
    }
};

// 错误处理辅助函数
const handleAIError = (model: string, error: any): string => {
    const timestamp = new Date().toISOString();
    const errorMessage = error?.message || String(error);
    const stack = error?.stack || "No stack trace";
    console.error(`[${timestamp}] [ERROR] [${model} API] ${errorMessage}\n${stack}`);
    return `${model} API Error: ${errorMessage.substring(0, 100)}`;
};

// Gemini API调用
export const askGemini = async (prompt: string, rolePrompt?: string): Promise<string> => {
    const finalPrompt = rolePrompt ? `${rolePrompt}\n\n用户问题：${prompt}` : prompt;
    try {
        const response = await geminiAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: finalPrompt,
            config: {
                tools: [{googleSearch: {}}]
            }
        });
        return response.text || "No response";
    } catch (error) {
        return handleAIError("Gemini", error);
    }
};

// 腾讯混元API调用
export const askHunyuan = async (prompt: string, rolePrompt?: string): Promise<string> => {
    const finalPrompt = rolePrompt ? `${rolePrompt}\n\n用户问题：${prompt}` : prompt;
    try {
        const completion = await hunyuanAI.chat.completions.create({
            model: "hunyuan-turbos-latest",
            messages: [
                {
                    role: "user",
                    content: finalPrompt
                }
            ]
        });
        return completion.choices[0].message.content || "No response";
    } catch (error) {
        return handleAIError("Hunyuan", error);
    }
};

// Cloudflare API工具定义
const tools: OpenAI.ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "get_weather",
            description: "Get the weather in a given location",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "The city and state, e.g. Chicago, IL"
                    },
                    unit: {type: "string", enum: ["celsius", "fahrenheit"]}
                },
                required: ["location"]
            }
        }
    }
];

// Cloudflare API调用
export const askCloudflare = async (prompt: string, rolePrompt?: string): Promise<string> => {
    const finalPrompt = rolePrompt ? `${rolePrompt}\n\n用户问题：${prompt}` : prompt;
    try {
        const completion = await cloudflareAI.chat.completions.create({
            model: "@cf/meta/llama-3-8b-instruct",
            messages: [
                {
                    role: "user",
                    content: finalPrompt
                }
            ],
            tools: tools
        });
        return completion.choices[0].message.content || "No response";
    } catch (error) {
        return handleAIError("Cloudflare", error);
    }
};

// 统一AI调用接口
export const askAI = async (prompt: string, context: UserContext): Promise<string> => {
    const {model, role} = context;
    const rolePrompt = role ? roles[role]?.prompt : undefined;
    
    console.log(`[${new Date().toISOString()}] [INFO] 使用模型: ${model}${role ? `, 角色: ${role}` : ''}`);
    
    try {
        switch (model) {
            case "gemini":
                return await askGemini(prompt, rolePrompt);
            case "hunyuan":
                return await askHunyuan(prompt, rolePrompt);
            case "cloudflare":
                return await askCloudflare(prompt, rolePrompt);
            default:
                return await askHunyuan(prompt, rolePrompt); // 默认使用腾讯混元
        }
    } catch (error) {
        return handleAIError(`统一AI调用(${model})`, error);
    }
};
