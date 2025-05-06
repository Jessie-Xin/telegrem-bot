import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import {askAI, AIModel, roles} from "./ai";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {polling: true});

// 用户管理类
class UserManager {
    private lastMessageTimes = new Map<number, number>();
    private lastSwitchTimes = new Map<number, number>();
    private userModels = new Map<number, AIModel>();
    private userRoles = new Map<number, string>();
    private readonly MESSAGE_COOLDOWN = 10000; // 10秒消息冷却
    private readonly SWITCH_COOLDOWN = 100000; // 100秒切换冷却

    // 获取用户模型
    getModel(userId: number): AIModel {
        return this.userModels.get(userId) || "hunyuan";
    }

    // 获取用户角色
    getRole(userId: number): string | undefined {
        return this.userRoles.get(userId);
    }

    // 设置用户模型
    setModel(userId: number, model: AIModel): void {
        this.userModels.set(userId, model);
        this.updateSwitchTime(userId);
    }

    // 设置用户角色
    setRole(userId: number, role: string): void {
        this.userRoles.set(userId, role);
        this.updateSwitchTime(userId);
    }

    // 更新消息时间
    updateMessageTime(userId: number): void {
        this.lastMessageTimes.set(userId, Date.now());
    }

    // 更新切换时间
    updateSwitchTime(userId: number): void {
        this.lastSwitchTimes.set(userId, Date.now());
    }

    // 检查消息冷却
    canSendMessage(userId: number): boolean {
        const lastTime = this.lastMessageTimes.get(userId);
        return !lastTime || Date.now() - lastTime >= this.MESSAGE_COOLDOWN;
    }

    // 检查切换冷却
    canSwitch(userId: number): boolean {
        const lastTime = this.lastSwitchTimes.get(userId);
        return !lastTime || Date.now() - lastTime >= this.SWITCH_COOLDOWN;
    }

    // 清理长时间不活跃的用户数据
    cleanInactiveUsers(maxInactiveTime: number = 24 * 60 * 60 * 1000): void {
        const now = Date.now();

        // 清理消息时间记录
        this.lastMessageTimes.forEach((time, userId) => {
            if (now - time > maxInactiveTime) {
                this.lastMessageTimes.delete(userId);
            }
        });

        // 清理切换时间记录
        this.lastSwitchTimes.forEach((time, userId) => {
            if (now - time > maxInactiveTime) {
                this.lastSwitchTimes.delete(userId);
            }
        });

        // 清理用户模型记录
        this.userModels.forEach((_, userId) => {
            if (!this.lastMessageTimes.has(userId) && !this.lastSwitchTimes.has(userId)) {
                this.userModels.delete(userId);
            }
        });

        // 清理用户角色记录
        this.userRoles.forEach((_, userId) => {
            if (!this.lastMessageTimes.has(userId) && !this.lastSwitchTimes.has(userId)) {
                this.userRoles.delete(userId);
            }
        });

        console.log(`已清理不活跃用户数据，当前活跃用户数: ${this.lastMessageTimes.size}`);
    }
}

// 错误处理类
class ErrorHandler {
    // 统一错误日志格式
    static logError(context: string, error: any): void {
        const timestamp = new Date().toISOString();
        const errorMessage = error?.message || String(error);
        const stack = error?.stack || "No stack trace";
        console.error(`[${timestamp}] [ERROR] [${context}] ${errorMessage}\n${stack}`);
    }

    // 处理Telegram API错误
    static async handleTelegramError(context: string, error: any, retryFn?: () => Promise<any>): Promise<any> {
        this.logError(context, error);

        // 处理速率限制错误
        if (error?.code === "ETELEGRAM" && error?.response?.statusCode === 429) {
            const retryAfter = error.response.headers["retry-after"] || 5;
            console.log(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

            // 如果提供了重试函数，则执行
            if (retryFn) {
                return retryFn();
            }
        }

        throw error;
    }
}

// 创建用户管理器实例
const userManager = new UserManager();

// 创建模型选择按钮
const modelKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                {text: "Gemini", callback_data: "model_gemini"},
                {text: "Hunyuan", callback_data: "model_hunyuan"},
                {text: "Cloudflare", callback_data: "model_cloudflare"}
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

// 添加错误处理和重试逻辑的辅助函数
const escapeMarkdown = (text: string): string => {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
};

const sendMessageWithRetry = async (chatId: number, text: string, options: any = {}): Promise<TelegramBot.Message | undefined> => {
    try {
        const escapedText = options.parse_mode === "MarkdownV2" ? escapeMarkdown(text) : text;
        return await bot.sendMessage(chatId, escapedText, options);
    } catch (error: any) {
        // 处理速率限制错误
        if (error.code === "ETELEGRAM" && error.response?.statusCode === 429) {
            const retryAfter = error.response.headers["retry-after"] || 5;
            console.log(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

            // 递归重试一次
            return sendMessageWithRetry(chatId, text, options);
        }
        throw error;
    }
};

// 处理切换模型命令
const handleSwitchModelCommand = async (msg: TelegramBot.Message): Promise<void> => {
    if (!msg.chat?.id) return;

    try {
        await sendMessageWithRetry(msg.chat.id, "请选择AI模型：", modelKeyboard);
    } catch (error) {
        await handleCommandError(error, msg, "发送模型选择菜单", "发送选择菜单时发生错误，请稍后重试");
    }
};

// 处理切换角色命令
const handleSwitchRoleCommand = async (msg: TelegramBot.Message): Promise<void> => {
    if (!msg.chat?.id) return;

    try {
        await sendMessageWithRetry(msg.chat.id, "请选择AI角色：", roleKeyboard);
    } catch (error) {
        await handleCommandError(error, msg, "发送角色选择菜单", "发送选择菜单时发生错误，请稍后重试");
    }
};

// 统一处理命令错误
const handleCommandError = async (error: any, msg: TelegramBot.Message, context: string, errorMessage: string): Promise<void> => {
    ErrorHandler.logError(context, error);
    try {
        await sendMessageWithRetry(msg.chat.id!, errorMessage, {
            reply_to_message_id: msg.message_id
        });
    } catch (sendError) {
        ErrorHandler.logError("发送错误消息", sendError);
    }
};

// 处理回调查询错误的辅助函数
const handleCallbackQueryError = async (callbackQuery: TelegramBot.CallbackQuery, errorMessage: string): Promise<void> => {
    try {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: errorMessage,
            show_alert: true
        });
    } catch (error) {
        ErrorHandler.logError("发送回调应答", error);
    }
};

// 处理模型和角色选择回调
bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const userId = callbackQuery.from.id;
    const useName = callbackQuery.from.first_name;
    const useLastName = callbackQuery.from.last_name;
    const useFullName = useName + (useLastName ? ` ${useLastName}` : "");

    if (!msg) return;

    if (callbackQuery.data?.startsWith("model_") || callbackQuery.data?.startsWith("role_")) {
        // 检查用户是否可以切换模型或角色
        if (!userManager.canSwitch(userId)) {
            await handleCallbackQueryError(callbackQuery, "切换频率过高，请在1分钟后尝试");
            return;
        }

        try {
            if (callbackQuery.data.startsWith("model_")) {
                const model = callbackQuery.data.replace("model_", "") as AIModel;
                userManager.setModel(userId, model);
                await bot.answerCallbackQuery(callbackQuery.id);
                await sendMessageWithRetry(msg.chat.id, `${useFullName}已切换到 ${model} 模型`, {});
            } else {
                const role = callbackQuery.data.replace("role_", "");
                userManager.setRole(userId, role);
                const roleName = roles[role].name;
                await bot.answerCallbackQuery(callbackQuery.id);
                await sendMessageWithRetry(msg.chat.id, `${useFullName}已切换到 ${roleName} 角色`, {});
            }
        } catch (error) {
            ErrorHandler.logError("处理模型/角色切换", error);
            await handleCallbackQueryError(callbackQuery, "切换时发生错误，请稍后重试");
        }
    }
});

// 注册命令处理器
bot.onText(/\/switchmodel/, handleSwitchModelCommand);
bot.onText(/\/switchrole/, handleSwitchRoleCommand);

// 处理频率限制消息的辅助函数
const handleRateLimitMessage = async (msg: TelegramBot.Message, errorMessage: string): Promise<void> => {
    try {
        await sendMessageWithRetry(msg.chat.id, errorMessage, {
            reply_to_message_id: msg.message_id
        });
    } catch (error) {
        ErrorHandler.logError("发送频率限制消息", error);
    }
};

// 处理用户消息
bot.on("message", async (msg) => {
    if (msg.chat.type == "group" || msg.chat.type == "supergroup") {
        if (msg.from?.id && msg.text && !msg.text.startsWith("/")) {
            const userId = msg.from.id;

            // 检查用户是否可以发送消息
            if (!userManager.canSendMessage(userId)) {
                await handleRateLimitMessage(msg, "发送频率过高请在十秒后尝试");
                return;
            }

            const userMessage = msg.text?.split("@xinwiz_bot")[1];
            if (userMessage) {
                try {
                    const model = userManager.getModel(userId);
                    const role = userManager.getRole(userId);
                    const response = await askAI(userMessage, {model, role});
                    if (response) {
                        await sendMessageWithRetry(msg.chat.id, response, {
                            reply_to_message_id: msg.message_id
                        });
                        userManager.updateMessageTime(userId);
                    }
                } catch (error) {
                    await handleCommandError(error, msg, "处理用户消息", "处理消息时发生错误，请稍后重试");
                }
            }
        }
    }
});

// 定期清理不活跃用户数据（每24小时）
setInterval(() => {
    userManager.cleanInactiveUsers();
}, 24 * 60 * 60 * 1000);
