"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const dotenv_1 = __importDefault(require("dotenv"));
const gemini_1 = require("./gemini");
dotenv_1.default.config();
const bot = new node_telegram_bot_api_1.default(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const userLastMessageTime = {}; // 记录用户最后发送消息的时间
bot.on("message", async (msg) => {
    if (msg.chat.type == "group" || msg.chat.type == "supergroup") {
        if (msg.from?.id) {
            const userId = msg.from.id;
            const currentTime = Date.now();
            console.log("userLastMessageTime", userLastMessageTime);
            // 检查用户是否在5秒内发送消息
            if (userLastMessageTime[userId] && currentTime - userLastMessageTime[userId] < 10000) {
                console.log("进入限制");
                bot.sendMessage(msg.chat?.id, "发送频率过高请在五秒后尝试", {
                    reply_to_message_id: msg.message_id
                }); // 如果在5秒内，直接返回
            }
            const userMessage = msg.text?.split("@xinwiz_bot")[1];
            console.log("userMessage", userMessage);
            if (userMessage) {
                const response = await (0, gemini_1.askGemini)(userMessage);
                if (response) {
                    bot.sendMessage(msg.chat?.id, response, {
                        reply_to_message_id: msg.message_id,
                        parse_mode: "MarkdownV2"
                    });
                }
                userLastMessageTime[userId] = currentTime; // 更新用户最后发送消息的时间
            }
        }
    }
    console.log(msg);
});
