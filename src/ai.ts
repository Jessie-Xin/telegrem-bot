import {GoogleGenAI} from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const geminiAI = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const hunyuanAI = new OpenAI({
    apiKey: process.env["HUNYUAN_API_KEY"],
    baseURL: "https://api.hunyuan.cloud.tencent.com/v1"
});

const cloudflareAI = new OpenAI({
    apiKey: process.env["CLOUDFLARE_API_KEY"],
    baseURL: `https://api.cloudflare.com/client/v4/accounts/c6435fdc5fb41b478467140cf7da739b/ai/v1`
});

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
        console.log("error", error);
        return "Gemini API Error";
    }
};

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
        console.log("error", error);
        return "Hunyuan API Error";
    }
};

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
export const askCloudflare = async (prompt: string, rolePrompt?: string): Promise<string> => {
    const finalPrompt = rolePrompt ? `${rolePrompt}\n\n用户问题：${prompt}` : prompt;
    try {
        const chatCompletion = await cloudflareAI.chat.completions.create({
            messages: [{role: "user", content: finalPrompt}],
            model: "@cf/google/gemma-2b-it-lora",
            tools: tools,
            tool_choice: "auto"
        });
        return chatCompletion.choices[0].message.content || "No response";
    } catch (error) {
        console.log("error", error);
        return "Cloudflare API Error";
    }
};

export const askAI = async (prompt: string, context: UserContext): Promise<string> => {
    const rolePrompt = context.role ? roles[context.role]?.prompt : undefined;

    switch (context.model) {
        case "gemini":
            return askGemini(prompt, rolePrompt);
        case "hunyuan":
            return askHunyuan(prompt, rolePrompt);
        case "cloudflare":
            return askCloudflare(prompt, rolePrompt);
        default:
            return "Invalid model selected";
    }
};
