import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import {askAI, AIModel, roles} from "./ai";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {polling: true});
const userLastMessageTime: {[key: number]: number} = {}; // 记录用户最后发送消息的时间
const userLastSwitchTime: {[key: number]: number} = {}; // 记录用户最后切换模型/角色的时间
const userModel: {[key: number]: AIModel} = {}; // 记录用户选择的模型
const userRole: {[key: number]: string} = {}; // 记录用户选择的角色

// 创建模型选择按钮
const modelKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                {text: "Gemini", callback_data: "model_gemini"},
                {text: "Hunyuan", callback_data: "model_hunyuan"}
            ]
        ]
    }
};

// 创建角色选择按钮
const roleKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                {text: "默认助手", callback_data: "role_default"},
                {text: "DJ 超", callback_data: "role_dj"}
            ]
        ]
    }
};

// 处理模型和角色选择回调
bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const userId = callbackQuery.from.id;

    if (!msg) return;

    if (callbackQuery.data?.startsWith("model_") || callbackQuery.data?.startsWith("role_")) {
        const currentTime = Date.now();
        // 检查用户是否在10秒内切换过模型或角色
        if (userLastSwitchTime[userId] && currentTime - userLastSwitchTime[userId] < 100000) {
            try {
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "切换频率过高，请在1分钟后尝试",
                    show_alert: true
                });
            } catch (error) {
                console.error("Error sending rate limit message:", error);
            }
            return;
        }

        try {
            if (callbackQuery.data.startsWith("model_")) {
                const model = callbackQuery.data.replace("model_", "") as AIModel;
                userModel[userId] = model;
                await bot.answerCallbackQuery(callbackQuery.id);
                await sendMessageWithRetry(msg.chat.id, `已切换到 ${model} 模型`, {});
userLastSwitchTime[userId] = currentTime;
            } else {
                const role = callbackQuery.data.replace("role_", "");
                userRole[userId] = role;
                const roleName = roles[role].name;
                await bot.answerCallbackQuery(callbackQuery.id);
                await sendMessageWithRetry(msg.chat.id, `已切换到 ${roleName} 角色`, {});
userLastSwitchTime[userId] = currentTime;
            }
        } catch (error) {
            console.error("Error handling model switch:", error);
            try {
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "切换模型时发生错误，请稍后重试",
                    show_alert: true
                });
            } catch (answerError) {
                console.error("Error sending callback answer:", answerError);
            }
        }
    }
});

bot.onText(/\/switchmodel/, async (msg) => {
    if (msg.chat.id) {
        try {
            await sendMessageWithRetry(msg.chat.id, "请选择AI模型：", modelKeyboard);
        } catch (error) {
            console.error("Error sending model selection message:", error);
            try {
                await sendMessageWithRetry(msg.chat.id, "发送选择菜单时发生错误，请稍后重试", {
                    reply_to_message_id: msg.message_id
                });
            } catch (sendError) {
                console.error("Error sending error message:", sendError);
            }
        }
    }
});

bot.onText(/\/switchrole/, async (msg) => {
    if (msg.chat.id) {
        try {
            await sendMessageWithRetry(msg.chat.id, "请选择AI角色：", roleKeyboard);
        } catch (error) {
            console.error("Error sending model selection message:", error);
            try {
                await sendMessageWithRetry(msg.chat.id, "发送选择菜单时发生错误，请稍后重试", {
                    reply_to_message_id: msg.message_id
                });
            } catch (sendError) {
                console.error("Error sending error message:", sendError);
            }
        }
    }
});

// 添加错误处理和重试逻辑的辅助函数
const escapeMarkdown = (text: string): string => {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
};

const sendMessageWithRetry = async (chatId: number, text: string, options: any, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const escapedText = options.parse_mode === "MarkdownV2" ? escapeMarkdown(text) : text;
            return await bot.sendMessage(chatId, escapedText, options);
        } catch (error: any) {
            if (error.code === "ETELEGRAM" && error.response?.statusCode === 429) {
                const retryAfter = error.response.headers["retry-after"] || 5;
                console.log(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
                await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Max retries reached");
};

bot.on("message", async (msg) => {
    if (msg.chat.type == "group" || msg.chat.type == "supergroup") {
        if (msg.from?.id && msg.text && !msg.text.startsWith("/")) {
            const userId = msg.from.id;
            const currentTime = Date.now();

            // 检查用户是否在10秒内发送消息
            if (userLastMessageTime[userId] && currentTime - userLastMessageTime[userId] < 10000) {
                try {
                    await sendMessageWithRetry(msg.chat.id, "发送频率过高请在十秒后尝试", {
                        reply_to_message_id: msg.message_id
                    });
                } catch (error) {
                    console.error("Error sending rate limit message:", error);
                }
                return;
            }

            const userMessage = msg.text?.split("@xinwiz_bot")[1];
            if (userMessage) {
                try {
                    const model = userModel[userId] || "hunyuan";
                    const role = userRole[userId];
                    const response = await askAI(userMessage, { model, role });
                    if (response) {
                        await sendMessageWithRetry(msg.chat.id, response, {
                            reply_to_message_id: msg.message_id,
                        });
                        userLastMessageTime[userId] = currentTime;
                    }
                } catch (error) {
                    console.error("Error processing message:", error);
                    try {
                        await sendMessageWithRetry(msg.chat.id, "处理消息时发生错误，请稍后重试", {
                            reply_to_message_id: msg.message_id
                        });
                    } catch (sendError) {
                        console.error("Error sending error message:", sendError);
                    }
                }
            }
        }
    }
});
