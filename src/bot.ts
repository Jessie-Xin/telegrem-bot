import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import {askGemini} from "./gemini";
// import {askGemini} from "./gemini";
// import {scheduleWeatherForecast} from "./scheduler";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {polling: true});

// 使用者選項
const options = {
    reply_markup: {
        keyboard: [[{text: "🌟 星座運勢"}, {text: "☀️ 天氣預報"}]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

bot.onText(/\/xinstart/, (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        bot.sendMessage(chatId, "請選擇您想使用的功能：", options);
    }
});

// 星座列表
const zodiacSigns = ["白羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"];

// 監聽用戶選擇星座運勢
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const isGroupChat = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    const isBotMentioned = msg.entities?.some(entity => 
        entity.type === 'mention' && 
        msg.text?.substring(entity.offset, entity.offset + entity.length) === '@XinBot' // 請將 XinBot 替換為您的機器人實際用戶名
    );

    if (!isGroupChat || (isGroupChat && !isBotMentioned)) {
        return;
    }

    if (msg.text === "🌟 星座運勢") {
        // 發送星座列表
        bot.sendMessage(chatId, "請選擇您的星座：", {
            reply_markup: {
                keyboard: zodiacSigns.map((zodiac) => [{text: zodiac}]),
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    } else if (msg.text && zodiacSigns.includes(msg.text)) {
        // 根據選擇的星座查詢運勢
        const horoscope = await askGemini(`請提供 ${msg.text} 今日的星座運勢`);
        if (horoscope) {
            bot.sendMessage(chatId, horoscope);
        }
        // 关闭键盘
        bot.sendMessage(chatId, "感谢您的选择！", {
            reply_markup: {
                remove_keyboard: true // 关闭选项
            }
        });
    } else if (msg.text === "☀️ 天氣預報") {
        bot.sendMessage(chatId, "請輸入想查詢天氣的城市，例如：台北", {
            reply_markup: {
                force_reply: true // 强制用户回复
            }
        });
    } else if (msg.reply_to_message && msg.reply_to_message.text === "請輸入想查詢天氣的城市，例如：台北") {
        // 检查用户输入是否为城市名称
        const weather = await askGemini(`請提供 ${msg.text} 今日及明日的天氣預報，包括溫度、降雨機率等資訊`);
        if (weather) {
            bot.sendMessage(chatId, weather);
        }
        // 关闭键盘
        bot.sendMessage(chatId, "感谢您的查询！", {
            reply_markup: {
                remove_keyboard: true // 关闭选项
            }
        });
    }
});

// 啟用定時推播
// scheduleWeatherForecast(bot);
