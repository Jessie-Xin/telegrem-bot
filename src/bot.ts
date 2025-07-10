import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import {askAI, AIModel, roles} from "./ai";
import {GameService} from "./gameService";
import {Game, Player, Role, UserId, GamePhase, PlayerStatus, WerewolfActionResult} from "./types"; // PlayerStatus is already here, no change needed. This is a check.
import {
    COMMAND_CREATE_GAME,
    COMMAND_JOIN_GAME,
    COMMAND_LEAVE_GAME,
    COMMAND_START_GAME,
    COMMAND_MY_ROLE,
    COMMAND_GAME_STATUS,
    MSG_GAME_CREATED,
    MSG_PLAYER_JOINED,
    MSG_PLAYER_LEFT,
    MSG_GAME_NOT_FOUND,
    MSG_ALREADY_IN_GAME,
    MSG_NOT_IN_GAME,
    MSG_GAME_FULL,
    MSG_GAME_STARTED_CANNOT_JOIN,
    MSG_GAME_STARTED_CANNOT_LEAVE,
    MSG_NOT_GAME_MASTER,
    MSG_GAME_STARTING,
    MSG_MIN_PLAYERS_NOT_REACHED,
    MSG_ROLE_ASSIGNED_PRIVATE,
    CALLBACK_PREFIX_JOIN_GAME,
    CALLBACK_PREFIX_VIEW_PLAYERS,
    CALLBACK_PREFIX_WEREWOLF_KILL,
    CALLBACK_PREFIX_SEER_CHOOSE,
    CALLBACK_PREFIX_START_GAME,
    CALLBACK_PREFIX_ACTION,
    CALLBACK_PREFIX_VOTE_PLAYER,
    CALLBACK_PREFIX_DAY_VOTE, // Added for daytime voting
    MAX_PLAYERS,
    MIN_PLAYERS,
    ROLE_CONFIGURATIONS
} from "./constants";
import {createJoinGameKeyboard, createGameLobbyKeyboard, createWerewolfActionKeyboard} from "./keyboards";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {polling: true});

// Markdown转义辅助函数
const escapeMarkdown = (text: string): string => {
    if (typeof text !== "string") return "";
    return text.replace(/[_*[\\\]()~`>#+\-=|{}.!]/g, "\\$&");
};

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

    // 处理发送消息错误并支持重试
    static async handleSendMessageError(chatId: string | number, text: string, options: any = {}): Promise<TelegramBot.Message | undefined> {
        try {
            const escapedText = options.parse_mode === "MarkdownV2" ? escapeMarkdown(text) : text;
            return await bot.sendMessage(chatId, escapedText, options);
        } catch (error: any) {
            return this.handleTelegramError("发送消息", error, async () => {
                return this.handleSendMessageError(chatId, text, options);
            });
        }
    }

    // 处理命令错误
    static async handleCommandError(error: any, msg: TelegramBot.Message, context: string, errorMessage: string): Promise<void> {
        this.logError(context, error);
        try {
            await this.handleSendMessageError(msg.chat.id!, errorMessage, {
                reply_to_message_id: msg.message_id
            });
        } catch (sendError) {
            this.logError("发送错误消息", sendError);
        }
    }

    // 处理回调查询错误
    static async handleCallbackQueryError(callbackQuery: TelegramBot.CallbackQuery, errorMessage: string): Promise<void> {
        try {
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: errorMessage,
                show_alert: true
            });
        } catch (error) {
            this.logError("发送回调应答", error);
        }
    }
}

// 创建用户管理器实例
const userManager = new UserManager();
const gameService = new GameService();

// 创建日间投票键盘
function createDayVoteKeyboard(game: Game): TelegramBot.InlineKeyboardMarkup {
    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    const alivePlayers = game.players.filter((p) => p.status === PlayerStatus.ALIVE);

    // Group players into rows of 2 for better layout, can be adjusted
    for (let i = 0; i < alivePlayers.length; i += 2) {
        const row: TelegramBot.InlineKeyboardButton[] = [];
        const player1 = alivePlayers[i];
        if (player1) {
            // Check if player1 exists
            row.push({
                text: `${player1.username || player1.id.toString()} (${player1.id})`,
                callback_data: `${CALLBACK_PREFIX_DAY_VOTE}${game.id}_${player1.id}`
            });
        }
        if (i + 1 < alivePlayers.length) {
            const player2 = alivePlayers[i + 1];
            if (player2) {
                // Check if player2 exists
                row.push({
                    text: `${player2.username || player2.id.toString()} (${player2.id})`,
                    callback_data: `${CALLBACK_PREFIX_DAY_VOTE}${game.id}_${player2.id}`
                });
            }
        }
        if (row.length > 0) {
            // Only push row if it has buttons
            keyboard.push(row);
        }
    }
    return {inline_keyboard: keyboard};
}

// 处理游戏阶段变化，发送通知和键盘
async function handleGamePhaseChange(game: Game, mainGameChatId: string | number, botInstance: TelegramBot) {
    ErrorHandler.logError(`Game ${game.id} phase change`, `Transitioning to ${game.phase}`); // Using ErrorHandler.logError for general logging too

    switch (game.phase) {
        case GamePhase.DISCUSSION:
            await ErrorHandler.handleSendMessageError(mainGameChatId, `第 ${game.round} 天，讨论阶段开始。请大家发言，找出狼人！`);
            // TODO: Set a timer for discussion to automatically advance to VOTING?
            // For now, assume manual advancement or other trigger leads to VOTING.
            break;

        case GamePhase.VOTING:
            await ErrorHandler.handleSendMessageError(mainGameChatId, `第 ${game.round} 天，讨论结束，现在开始投票！`);
            const voteKeyboard = createDayVoteKeyboard(game);
            if (voteKeyboard.inline_keyboard.length > 0) {
                await ErrorHandler.handleSendMessageError(mainGameChatId, "请选择你要投票的玩家：", {reply_markup: voteKeyboard});
            } else {
                await ErrorHandler.handleSendMessageError(mainGameChatId, "没有可投票的玩家。");
                // This case should ideally not happen if there are alive players.
                // Consider advancing phase again if no one can be voted.
            }
            break;

        case GamePhase.VOTE_RESULT:
            let voteResultMessage = "投票结果：\n";
            if (game.lynchedPlayerId) {
                const lynchedP = game.players.find((p) => p.id === game.lynchedPlayerId);
                voteResultMessage += `玩家 @${lynchedP?.username || game.lynchedPlayerId} (${game.lynchedPlayerId}) 被公投出局。`;
                // Hunter ability check would go here if lynchedP is Hunter
            } else {
                voteResultMessage += "没有人被公投出局（平票或无人投票）。";
            }
            await ErrorHandler.handleSendMessageError(mainGameChatId, voteResultMessage);
            // Automatically advance from VOTE_RESULT by calling gameService.advanceGamePhase again
            // This call will be made from where VOTE_RESULT was set, or here if it's a terminal display phase.
            // For now, the logic in CALLBACK_PREFIX_DAY_VOTE handles advancing from VOTE_RESULT.
            break;

        case GamePhase.LAST_WORDS:
            const lynchedPlayer = game.players.find((p) => p.id === game.lynchedPlayerId && p.status === PlayerStatus.DEAD);
            if (lynchedPlayer) {
                await ErrorHandler.handleSendMessageError(mainGameChatId, `@${lynchedPlayer.username || lynchedPlayer.id} (${lynchedPlayer.id}) 请发表遗言。`);
                // TODO: Implement a timer for last words, then advance phase.
            } else {
                // Should not happen if lynchedPlayerId is set, means player data is inconsistent
                ErrorHandler.logError(`last_words_error_${game.id}`, "Lynched player not found or not dead for last words.");
                // Force advance if stuck
                const nextPhaseResult = await gameService.advanceGamePhase(game.id);
                if (typeof nextPhaseResult !== "string" && nextPhaseResult.id) {
                    await handleGamePhaseChange(nextPhaseResult, mainGameChatId, botInstance);
                } else {
                    await ErrorHandler.handleSendMessageError(mainGameChatId, `阶段推进错误: ${nextPhaseResult}`);
                }
            }
            break;

        case GamePhase.NIGHT_START:
            await ErrorHandler.handleSendMessageError(mainGameChatId, `第 ${game.round} 夜，天黑请闭眼...`);
            // The actual turn progression is handled by gameService.advanceGamePhase
            // This just announces the night has started. We immediately try to advance to the first action.
            const nextPhaseResult = await gameService.advanceGamePhase(game.id);
            if (typeof nextPhaseResult !== 'string') {
                await handleGamePhaseChange(nextPhaseResult, mainGameChatId, botInstance);
            } else {
                await ErrorHandler.handleSendMessageError(mainGameChatId, `阶段推进失败: ${nextPhaseResult}`);
            }
            break;

        case GamePhase.WEREWOLF_ACTION:
            const aliveWerewolves = game.players.filter((p) => p.role === Role.WEREWOLF && p.status === PlayerStatus.ALIVE);
            if (aliveWerewolves.length > 0) {
                await ErrorHandler.handleSendMessageError(mainGameChatId, "狼人请睁眼，并私聊机器人选择目标。🐺");
                const werewolfKeyboard = createWerewolfActionKeyboard(game, aliveWerewolves[0].id);
                for (const werewolf of aliveWerewolves) {
                    await ErrorHandler.handleSendMessageError(werewolf.id, "请选择今晚要袭击的目标：", {reply_markup: werewolfKeyboard});
                }
            }
            break;

        case GamePhase.SEER_ACTION:
            const seer = game.players.find((p) => p.role === Role.SEER && p.status === PlayerStatus.ALIVE);
            if (seer) {
                await ErrorHandler.handleSendMessageError(mainGameChatId, "预言家请睁眼，请选择一名玩家查看其身份。🔍");
                const seerActionKeyboard: TelegramBot.InlineKeyboardButton[][] = [];
                const alivePlayersForSeer = game.players.filter((p) => p.status === PlayerStatus.ALIVE && p.id !== seer.id);
                alivePlayersForSeer.forEach((p) => {
                    seerActionKeyboard.push([
                        {
                            text: `${p.username || p.id.toString()}`,
                            callback_data: `${CALLBACK_PREFIX_SEER_CHOOSE}${game.id}_${p.id}`
                        }
                    ]);
                });
                if (seerActionKeyboard.length > 0) {
                    await ErrorHandler.handleSendMessageError(seer.id, "请选择一名玩家查看其身份：", {reply_markup: {inline_keyboard: seerActionKeyboard}});
                } else {
                    await ErrorHandler.handleSendMessageError(seer.id, "场上已无其他存活玩家可供查看。");
                }
            }
            break;

        case GamePhase.DAY_START:
            let dayStartMessage = `☀️ 天亮了，昨晚...`;
            if (game.lastNightKilled && game.lastNightKilled.length > 0) {
                const killedUsernames = game.lastNightKilled.map(p => `@${p.username}`).join(', ');
                dayStartMessage += ` ${killedUsernames} 被淘汰了。`;
            } else {
                dayStartMessage += ` 是一个平安夜。`;
            }
            await ErrorHandler.handleSendMessageError(mainGameChatId, dayStartMessage);

            const dayPhaseResult = await gameService.advanceGamePhase(game.id);
            if (typeof dayPhaseResult === 'string') {
                await ErrorHandler.handleSendMessageError(mainGameChatId, `阶段推进失败: ${dayPhaseResult}`);
            } else {
                await handleGamePhaseChange(dayPhaseResult, mainGameChatId, botInstance);
            }
            break;

        case GamePhase.GAME_OVER:
            let gameOverMessage = "游戏结束！\n";
            if (game.winner === Role.WEREWOLF) {
                gameOverMessage += "狼人阵营胜利！";
            } else if (game.winner === Role.VILLAGER) {
                gameOverMessage += "村民阵营胜利！";
            } else {
                gameOverMessage += "游戏以意想不到的方式结束了... (可能是平局或配置问题)";
            }
            await ErrorHandler.handleSendMessageError(mainGameChatId, gameOverMessage);
            // TODO: Display roles at the end of the game.
            break;

        default:
            await ErrorHandler.handleSendMessageError(mainGameChatId, `游戏进入了一个未知阶段: ${game.phase}。请联系管理员。`);
            ErrorHandler.logError(`unhandled_game_phase_${game.id}`, `Unhandled game phase: ${game.phase}`);
            break;
    }
}

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

// 处理切换模型命令
const handleSwitchModelCommand = async (msg: TelegramBot.Message): Promise<void> => {
    if (!msg.chat?.id) return;

    try {
        await ErrorHandler.handleSendMessageError(msg.chat.id, "请选择AI模型：", modelKeyboard);
    } catch (error) {
        await handleCommandError(error, msg, "发送模型选择菜单", "发送选择菜单时发生错误，请稍后重试");
    }
};

// 处理切换角色命令
const handleSwitchRoleCommand = async (msg: TelegramBot.Message): Promise<void> => {
    if (!msg.chat?.id) return;

    try {
        await ErrorHandler.handleSendMessageError(msg.chat.id, "请选择AI角色：", roleKeyboard);
    } catch (error) {
        await handleCommandError(error, msg, "发送角色选择菜单", "发送选择菜单时发生错误，请稍后重试");
    }
};

// 统一处理命令错误 - 使用ErrorHandler类方法
const handleCommandError = async (error: any, msg: TelegramBot.Message, context: string, errorMessage: string): Promise<void> => {
    return ErrorHandler.handleCommandError(error, msg, context, errorMessage);
};

// 处理回调查询错误的辅助函数 - 使用ErrorHandler类方法
const handleCallbackQueryError = async (callbackQuery: TelegramBot.CallbackQuery, errorMessage: string): Promise<void> => {
    return ErrorHandler.handleCallbackQueryError(callbackQuery, errorMessage);
};

// 游戏命令处理
const handleCreateGameCommand = async (msg: TelegramBot.Message) => {
    console.log(`[${new Date().toISOString()}] /creategame command received from chat: ${msg.chat.id}, user: ${msg.from?.id}`); // Debugging line
    if (!msg.from || !msg.from.id) {
        ErrorHandler.logError("handleCreateGameCommand", "Critical missing user info: msg.from or msg.from.id is undefined.");
        // Inform the user in chat as this is a critical failure
        await ErrorHandler.handleSendMessageError(msg.chat.id, "无法识别您的用户信息，无法创建游戏。请确保您的Telegram账户设置正确。", {reply_to_message_id: msg.message_id});
        return;
    }

    // Construct a username: prioritize msg.from.username, then msg.from.first_name, then a default
    let gameMasterUsername = msg.from.username;
    if (!gameMasterUsername) {
        gameMasterUsername = msg.from.first_name;
        if (msg.from.last_name) {
            gameMasterUsername += ` ${msg.from.last_name}`;
        }
    }
    if (!gameMasterUsername) {
        // Fallback if even first_name is missing
        gameMasterUsername = `玩家${msg.from.id}`;
    }
    // Ensure username is a string, even if it was initially undefined from msg.from.username
    const finalGameMasterUsername = gameMasterUsername || `玩家${msg.from.id}`;

    if (msg.chat.type !== "group" && msg.chat.type !== "supergroup") {
        await ErrorHandler.handleSendMessageError(msg.chat.id, "狼人殺遊戲只能在群組中創建。", {reply_to_message_id: msg.message_id});
        return;
    }

    try {
        const result = gameService.createGame(msg.chat.id, msg.from.id, finalGameMasterUsername);
        if (typeof result === "string") {
            // Error message returned
            await ErrorHandler.handleSendMessageError(msg.chat.id, result, {reply_to_message_id: msg.message_id});
        } else {
            // Game object returned
            const game = result;
            const messageText = MSG_GAME_CREATED(game.id, game.players.find((p) => p.isGameMaster)?.username || "未知房主");
            const sentMessage = await ErrorHandler.handleSendMessageError(msg.chat.id, messageText, {
                reply_markup: createJoinGameKeyboard(game.id)
            });
            if (sentMessage) {
                gameService.setLobbyMessageId(game.id, sentMessage.message_id);
            }
        }
    } catch (error) {
        await ErrorHandler.handleCommandError(error, msg, "handleCreateGameCommand", "創建遊戲時發生錯誤。");
    }
};

// 处理模型和角色选择回调以及游戏回调
bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const userId = callbackQuery.from.id;
    const useName = callbackQuery.from.first_name;
    const useLastName = callbackQuery.from.last_name;
    const data = callbackQuery.data; // 从 callbackQuery 中获取 data

    // 基本驗證，確保 msg 和 data 存在
    if (!msg || !data) {
        ErrorHandler.logError("callback_query_handler", "Missing message or data in callbackQuery");
        // 嘗試應答回調以避免客戶端掛起
        if (callbackQuery.id) {
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (e) {
                ErrorHandler.logError("callback_query_handler", "Failed to answer empty callback");
            }
        }
        return;
    }

    try {
        if (data.startsWith("model_") || data.startsWith("role_")) {
            const isModelSwitch = data.startsWith("model_");
            const newSelection = data.substring(isModelSwitch ? "model_".length : "role_".length);

            if (!userManager.canSwitch(userId)) {
                await bot.answerCallbackQuery(callbackQuery.id, {text: "操作过于频繁，请稍后再试。", show_alert: true});
                return; // 返回以避免執行後續代碼或重複應答
            }

            if (isModelSwitch) {
                userManager.setModel(userId, newSelection as AIModel);
                await bot.answerCallbackQuery(callbackQuery.id, {text: `AI 模型已切换为 ${newSelection}`});
            } else {
                userManager.setRole(userId, newSelection);
                await bot.answerCallbackQuery(callbackQuery.id, {text: `角色已切换为 ${roles[newSelection]?.name || newSelection}`});
            }
            console.log(`User ${userId} switched ${isModelSwitch ? "model" : "role"} to ${newSelection}`);
        } else if (data.startsWith(CALLBACK_PREFIX_JOIN_GAME)) {
            const gameId = data.substring(CALLBACK_PREFIX_JOIN_GAME.length);
            // callbackQuery.from.username 可能為 undefined
            const username = callbackQuery.from.username || `User${callbackQuery.from.id}`;

            const result = gameService.joinGame(gameId, callbackQuery.from.id, username);
            if (typeof result === "string") {
                await bot.answerCallbackQuery(callbackQuery.id, {text: result, show_alert: true});
            } else {
                const game = result;
                await bot.answerCallbackQuery(callbackQuery.id, {text: `成功加入遊戲！`});
                // 在群組中通知玩家加入
                if (msg.chat) {
                    // 確保 msg.chat 存在
                    await ErrorHandler.handleSendMessageError(msg.chat.id, MSG_PLAYER_JOINED(username));

                    // 更新遊戲大廳消息和鍵盤
                    if (game.messageIdToEdit) {
                        try {
                            // 决定是否在共享的游戏大厅消息中显示“开始游戏”按钮：取决于玩家人数是否达到最低要求。
                            // 真正的权限验证（只有房主能点）在 gameService.startGame 中进行。
                            const canGameBeStartedByGM = game.players.length >= MIN_PLAYERS;
                            const newKeyboard = createGameLobbyKeyboard(game.id, canGameBeStartedByGM);

                            const gameMasterUsername = game.players.find((p) => p.isGameMaster)?.username || "未知房主";
                            const playerUsernames = game.players.map((p) => `@${p.username || p.id}${p.isGameMaster ? " (房主)" : ""}`);
                            const lobbyMessageText =
                                `狼人殺遊戲已創建！房主: @${gameMasterUsername}
` +
                                `遊戲ID: ${game.id}
` +
                                `当前玩家 (${game.players.length}/${MAX_PLAYERS}):
${playerUsernames.join("\n") || "暂无玩家"}
` +
                                `點擊下方按鈕加入或開始遊戲👇`;

                            await bot.editMessageText(lobbyMessageText, {
                                chat_id: msg.chat.id,
                                message_id: game.messageIdToEdit,
                                reply_markup: newKeyboard
                            });
                        } catch (editError) {
                            ErrorHandler.logError(`edit_lobby_after_join_${game.id}`, editError);
                            // 如果編輯失敗，可以考慮發送一條新消息提示狀態，但可能會造成信息混亂
                        }
                    }
                }
                // 原來的 TODO 已處理
            }
        } else if (data.startsWith(CALLBACK_PREFIX_VIEW_PLAYERS)) {
            const gameId = data.substring(CALLBACK_PREFIX_VIEW_PLAYERS.length);
            const game = gameService.getGame(gameId);
            if (game) {
                const playerUsernames = game.players.map((p) => `@${p.username || p.id}${p.isGameMaster ? " (房主)" : ""}`);
                const messageText = `当前玩家 (${game.players.length}/${MAX_PLAYERS}):\n${playerUsernames.join("\n") || "暂无玩家"}`;
                // MarkdownV2 需要轉義，但 answerCallbackQuery 的 text 字段不支持 Markdown
                // 如果要在彈出窗口中顯示 Markdown，需要 bot.sendMessage 或 editMessageText
                // alert 的 text 是純文本
                await bot.answerCallbackQuery(callbackQuery.id, {text: messageText, show_alert: true});
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, {text: MSG_GAME_NOT_FOUND, show_alert: true});
            }
        } else if (data.startsWith(CALLBACK_PREFIX_START_GAME)) {
            const gameId = data.substring(CALLBACK_PREFIX_START_GAME.length);
            const requestingUserId = callbackQuery.from.id;

            const result = gameService.startGame(gameId, requestingUserId);

            if (typeof result === "string") {
                // Error message returned
                await bot.answerCallbackQuery(callbackQuery.id, {text: result, show_alert: true});
            } else {
                // Game object returned
                const game = result;
                await bot.answerCallbackQuery(callbackQuery.id, {text: "游戏开始中..."}); // Acknowledge the button press

                // Edit the original game lobby message or send a new one
                if (game.messageIdToEdit && msg.chat) {
                    try {
                        await bot.editMessageText(`游戏 ${game.id} 已开始！角色分配中...`, {
                            chat_id: msg.chat.id,
                            message_id: game.messageIdToEdit,
                            reply_markup: {inline_keyboard: []} // Remove all buttons
                        });
                    } catch (editError) {
                        ErrorHandler.logError(`edit_lobby_message_error_${game.id}`, editError);
                        // If editing fails, send a new message as fallback
                        await ErrorHandler.handleSendMessageError(msg.chat.id, MSG_GAME_STARTING);
                    }
                } else if (msg.chat) {
                    // If somehow messageIdToEdit is not available, send a new message
                    await ErrorHandler.handleSendMessageError(msg.chat.id, MSG_GAME_STARTING);
                }

                // Send roles to players privately
                for (const player of game.players) {
                    if (player.role) {
                        // Ensure role is assigned
                        try {
                            // MSG_ROLE_ASSIGNED_PRIVATE is already defined in constants.ts
                            await ErrorHandler.handleSendMessageError(player.id, MSG_ROLE_ASSIGNED_PRIVATE(player.role));
                        } catch (error) {
                            ErrorHandler.logError(`send_role_pm_error_${player.id}`, error);
                            // Optionally, inform the group if a PM fails, or log it for admin.
                            if (msg.chat) {
                                await ErrorHandler.handleSendMessageError(msg.chat.id, `发送角色给玩家 @${player.username} 失败，请确保机器人未被该玩家屏蔽。`);
                            }
                        }
                    }
                }

                // Inform werewolves about their teammates
                const werewolves = game.players.filter((p) => p.role === Role.WEREWOLF && p.status === PlayerStatus.ALIVE);
                if (werewolves.length > 0) {
                    const werewolfUsernames = werewolves.map((w) => `@${w.username || w.id}`).join(", ");
                    for (const werewolf of werewolves) {
                        try {
                            let werewolfNotification = "你是狼人🐺.";
                            if (werewolves.length > 1) {
                                const otherWerewolves = werewolves
                                    .filter((w) => w.id !== werewolf.id)
                                    .map((w) => `@${w.username || w.id}`)
                                    .join(", ");
                                if (otherWerewolves) {
                                    werewolfNotification += ` 你的狼队友是：${otherWerewolves}。`;
                                }
                                // If otherWerewolves is empty, it means this is the only alive werewolf among the initial set, covered by the else.
                            } else {
                                werewolfNotification += " 你是唯一的狼人。";
                            }
                            werewolfNotification += " 今晚请一起选择目标。";
                            await ErrorHandler.handleSendMessageError(werewolf.id, werewolfNotification);
                        } catch (error) {
                            ErrorHandler.logError(`send_werewolf_team_info_error_${werewolf.id}`, error);
                            if (msg.chat) {
                                await ErrorHandler.handleSendMessageError(msg.chat.id, `发送狼人同伴信息给 @${werewolf.username} 失败，请确保机器人未被该玩家屏蔽。`);
                            }
                        }
                    }
                }

                // Announce the first phase (e.g., Night) and advance game state
                if (msg.chat) {
                    let nightMessage = `天黑请闭眼... 当前是第 ${game.round} 夜。`;
                    await ErrorHandler.handleSendMessageError(msg.chat.id, nightMessage);

                    // Advance to the first night action phase (e.g., Werewolf Action)
                    const advancedGameResult = await gameService.advanceGamePhase(game.id);
                    if (typeof advancedGameResult === "string") {
                        ErrorHandler.logError(`advance_phase_failed_after_start_${game.id}`, advancedGameResult);
                        await ErrorHandler.handleSendMessageError(msg.chat.id, `游戏阶段推进失败: ${advancedGameResult}`);
                        return; // Stop further processing for this game start if phase advance fails
                    }

                    let currentGame: Game = advancedGameResult; // Update game state with the new phase

                    // Now, handle specific actions based on the new phase (e.g., WEREWOLF_ACTION)
                    if (currentGame.phase === GamePhase.WEREWOLF_ACTION) {
                        const aliveWerewolves = currentGame.players.filter((p) => p.role === Role.WEREWOLF && p.status === PlayerStatus.ALIVE);
                        if (aliveWerewolves.length > 0) {
                            await ErrorHandler.handleSendMessageError(msg.chat.id, "狼人请睁眼，并私聊机器人选择目标。🐺"); // Public prompt
                            for (const werewolf of aliveWerewolves) {
                                try {
                                    const keyboard = createWerewolfActionKeyboard(currentGame, werewolf.id);
                                    if (keyboard.inline_keyboard.length > 0) {
                                        // Check if there are actually targets
                                        await ErrorHandler.handleSendMessageError(werewolf.id, "请选择今晚要淘汰的玩家：", {reply_markup: keyboard});
                                    } else {
                                        await ErrorHandler.handleSendMessageError(werewolf.id, "没有可选择的目标玩家。");
                                        // This case should ideally be handled by advancing the phase if no targets are available for any werewolf.
                                        // For now, just informs the werewolf.
                                    }
                                } catch (pmError) {
                                    ErrorHandler.logError(`send_werewolf_action_prompt_error_${werewolf.id}`, pmError);
                                    await ErrorHandler.handleSendMessageError(msg.chat.id, `发送行动提示给 @${werewolf.username || werewolf.id} 失败。`);
                                }
                            }
                        } else {
                            // No alive werewolves, game should proceed to next phase automatically
                            ErrorHandler.logError(`no_alive_werewolves_at_action_${currentGame.id}`, "No alive werewolves for WEREWOLF_ACTION phase.");
                            await ErrorHandler.handleSendMessageError(msg.chat.id, "没有存活的狼人。夜晚流程将自动继续...");
                            // Attempt to advance phase again if no werewolves are there to act
                            const skippedPhaseResult = await gameService.advanceGamePhase(currentGame.id);
                            if (typeof skippedPhaseResult === "string") {
                                ErrorHandler.logError(`advance_phase_failed_after_skip_ww_${currentGame.id}`, skippedPhaseResult);
                                await ErrorHandler.handleSendMessageError(msg.chat.id, `再次尝试阶段推进失败: ${skippedPhaseResult}`);
                            } else {
                                currentGame = skippedPhaseResult;
                                // TODO: Handle the next phase (e.g., SEER_ACTION) based on currentGame.phase
                                // This part will need to be expanded or handled by a dedicated night progression manager function
                                console.log(`[Bot] Game ${currentGame.id} advanced to ${currentGame.phase} after skipping werewolf action.`);
                                await ErrorHandler.handleSendMessageError(msg.chat.id, `已自动进入下一阶段: ${currentGame.phase}`);
                            }
                        }
                    }
                    // TODO: Add similar blocks for SEER_ACTION, WITCH_ACTION etc., as the game progresses.
                    // This will likely be handled in a separate function that manages night progression or in the callback query handler for actions.
                }
            }
            // 在這裡添加其他遊戲相關的 else if 條件，例如開始遊戲、投票等
            // 例如: else if (data.startsWith(CALLBACK_PREFIX_VOTE)) { ... }
        } else if (data.startsWith(CALLBACK_PREFIX_WEREWOLF_KILL)) {
            const gameIdAndTarget = data.substring(CALLBACK_PREFIX_WEREWOLF_KILL.length);
            const parts = gameIdAndTarget.split("_");
            if (parts.length !== 2) {
                ErrorHandler.logError("ww_kill_callback_invalid_format", `Invalid format for ww_kill callback: ${data}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "回调数据格式错误。", show_alert: true});
                return;
            }
            const gameId = parts[0];
            const targetPlayerIdStr = parts[1];
            const targetPlayerId = parseInt(targetPlayerIdStr, 10);

            if (isNaN(targetPlayerId)) {
                ErrorHandler.logError("ww_kill_callback_invalid_target_id", `Invalid target player ID: ${targetPlayerIdStr}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "目标玩家ID无效。", show_alert: true});
                return;
            }

            const votingWerewolfId = callbackQuery.from.id;

            if (!msg || !msg.chat) {
                ErrorHandler.logError("ww_kill_callback_no_msg", `Callback query message or chat is undefined for game ${gameId}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "发生内部错误，无法处理您的操作。", show_alert: true});
                return;
            }

            const result: WerewolfActionResult = gameService.werewolfVoteKill(gameId, votingWerewolfId, targetPlayerId);

            await bot.answerCallbackQuery(callbackQuery.id, {text: result.message, show_alert: !result.success});

            if (result.success && result.game) {
                const updatedGame = result.game;
                const targetPlayer = updatedGame.players.find((p: Player) => p.id === targetPlayerId);
                const votedTargetUsername = result.targetUsername || (targetPlayer ? `@${targetPlayer.username || targetPlayer.id}` : `玩家 ${targetPlayerId}`);

                // Edit the original message to remove the keyboard or indicate vote cast
                try {
                    let editedMessageText = msg.text + `\n➡️ 你已选择: ${votedTargetUsername}`;
                    if (result.allWerewolvesVoted) {
                        const finalTargetPlayer = updatedGame.players.find((p: Player) => p.id === result.finalTargetId);
                        const finalTargetUsername = finalTargetPlayer ? `@${finalTargetPlayer.username || finalTargetPlayer.id}` : result.finalTargetId ? `玩家 ${result.finalTargetId}` : "无人";
                        editedMessageText += `\n所有狼人已投票，最终目标: ${finalTargetUsername}。`;
                    }
                    await bot.editMessageText(editedMessageText, {
                        chat_id: msg.chat.id, // Private chat with the werewolf
                        message_id: msg.message_id,
                        reply_markup: {inline_keyboard: []} // Remove keyboard
                    });
                } catch (editError) {
                    ErrorHandler.logError(`edit_ww_kill_message_error_${updatedGame.id}_${votingWerewolfId}`, editError);
                }

                // Notify other alive werewolves in the same game
                const aliveWerewolves = updatedGame.players.filter((p: Player) => p.role === Role.WEREWOLF && p.status === PlayerStatus.ALIVE && p.id !== votingWerewolfId);
                const votingWerewolfUser = updatedGame.players.find((p: Player) => p.id === votingWerewolfId);
                const votingWerewolfUsername = votingWerewolfUser ? `@${votingWerewolfUser.username || votingWerewolfUser.id}` : `一名狼人`;

                for (const otherWerewolf of aliveWerewolves) {
                    try {
                        let notification = `${votingWerewolfUsername} 已投票给 ${votedTargetUsername}.`;
                        if (result.allWerewolvesVoted) {
                            const finalTargetPlayer = updatedGame.players.find((p: Player) => p.id === result.finalTargetId);
                            const finalTargetUsername = finalTargetPlayer ? `@${finalTargetPlayer.username || finalTargetPlayer.id}` : result.finalTargetId ? `玩家 ${result.finalTargetId}` : "无人";
                            notification += ` 所有狼人已投票完毕，最终目标: ${finalTargetUsername}。`;
                        }
                        await ErrorHandler.handleSendMessageError(otherWerewolf.id, notification);
                    } catch (pmError) {
                        ErrorHandler.logError(`notify_other_ww_vote_error_${otherWerewolf.id}`, pmError);
                    }
                }

                if (result.allWerewolvesVoted) {
                    const mainGameChatId = updatedGame.id;
                    if (mainGameChatId) {
                        await ErrorHandler.handleSendMessageError(mainGameChatId, `🐺🔪 狼人行动结束。月黑风高，杀机暗藏...`);
                        const advancedGameResult = await gameService.advanceGamePhase(gameId);
                        if (typeof advancedGameResult === 'string') {
                            await ErrorHandler.handleSendMessageError(mainGameChatId, `阶段推进失败: ${advancedGameResult}`);
                        } else {
                            await handleGamePhaseChange(advancedGameResult, mainGameChatId, bot);
                        }
                    }
                }
            }
        }
        // 处理预言家选择回调
        else if (data.startsWith(CALLBACK_PREFIX_SEER_CHOOSE)) {
            const gameIdAndTarget = data.substring(CALLBACK_PREFIX_SEER_CHOOSE.length);
            const parts = gameIdAndTarget.split("_"); // 假设格式是 gameId_targetPlayerId

            if (parts.length !== 2) {
                ErrorHandler.logError("seer_choose_callback_invalid_format", `Invalid format for seer_choose callback: ${data}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "操作格式错误。", show_alert: true});
                return;
            }

            const gameId = parts[0];
            const targetPlayerId = parseInt(parts[1], 10);
            const seerUserId = callbackQuery.from.id;

            if (isNaN(targetPlayerId)) {
                ErrorHandler.logError("seer_choose_callback_invalid_target_id", `Invalid target player ID: ${parts[1]}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "目标玩家ID无效。", show_alert: true});
                return;
            }

            try {
                // 假设 gameService.seerAction 返回 { success: boolean, message: string, game?: Game, phaseChanged?: boolean, nextPhase?: GamePhase }
                // 或者一个错误字符串
                const result = await gameService.seerAction(gameId, seerUserId, targetPlayerId);

                if (typeof result === "string") {
                    // 错误信息
                    await bot.answerCallbackQuery(callbackQuery.id, {text: result, show_alert: true});
                } else {
                    // SeerActionResult
                    if (result.privateMessageForSeer) {
                        try {
                            await ErrorHandler.handleSendMessageError(seerUserId, result.privateMessageForSeer);
                            // 私聊成功后，再回复callback query
                            await bot.answerCallbackQuery(callbackQuery.id, {text: result.message || "查验成功。结果已通过私聊发送给你。"});
                        } catch (pmError) {
                            ErrorHandler.logError(`seer_action_send_pm_error_${gameId}_${seerUserId}`, pmError);
                            await bot.answerCallbackQuery(callbackQuery.id, {text: "查验已记录，但发送私聊结果失败。请确保已与机器人开始私聊。", show_alert: true});
                        }
                    } else {
                        // 即使没有私聊消息（理论上不应该），也用 service 返回的通用消息回复
                        await bot.answerCallbackQuery(callbackQuery.id, {text: result.message || "操作成功。"});
                    }

                    // 如果游戏阶段因预言家行动而改变
                    if (result.game && result.phaseChanged && msg.chat) {
                        const mainGameChatId = result.game.id;
                        await handleGamePhaseChange(result.game, mainGameChatId, bot);
                    }
                }
            } catch (error) {
                ErrorHandler.logError(`seer_action_error_${gameId}_${seerUserId}`, error);
                await handleCallbackQueryError(callbackQuery, "执行预言家操作时发生错误，请稍后重试。");
            }
        }
        // 处理日间投票回调
        else if (data.startsWith(CALLBACK_PREFIX_DAY_VOTE)) {
            const gameIdAndTarget = data.substring(CALLBACK_PREFIX_DAY_VOTE.length);
            const parts = gameIdAndTarget.split("_");
            if (parts.length !== 2) {
                ErrorHandler.logError("day_vote_callback_invalid_format", `Invalid format for day_vote callback: ${data}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "投票回调数据格式错误。", show_alert: true});
                return;
            }
            const gameId = parts[0];
            const targetPlayerIdStr = parts[1];
            const targetPlayerId = parseInt(targetPlayerIdStr, 10);
            const votingPlayerId = callbackQuery.from.id;

            if (isNaN(targetPlayerId)) {
                ErrorHandler.logError("day_vote_callback_invalid_target_id", `Invalid target player ID: ${targetPlayerIdStr}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "目标玩家ID无效。", show_alert: true});
                return;
            }

            if (!msg || !msg.chat) {
                ErrorHandler.logError("day_vote_callback_no_msg", `Callback query message or chat is undefined for game ${gameId}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "发生内部错误，无法处理您的操作。", show_alert: true});
                return;
            }
            const mainGameChatId = gameService.getGame(gameId)?.id; // This should be the group chat ID stored in game.id
            if (!mainGameChatId) {
                ErrorHandler.logError("day_vote_callback_no_main_chat_id", `Main game chat ID not found for game ${gameId}`);
                await bot.answerCallbackQuery(callbackQuery.id, {text: "游戏数据错误，无法找到主聊天室。", show_alert: true});
                return;
            }

            const result = await gameService.recordDayVote(gameId, votingPlayerId, targetPlayerId);
            await bot.answerCallbackQuery(callbackQuery.id, {text: result.message, show_alert: !result.success});

            if (result.success && result.game) {
                let updatedGame = result.game;
                const voter = updatedGame.players.find((p) => p.id === votingPlayerId);
                const target = updatedGame.players.find((p) => p.id === targetPlayerId);

                // Edit the original message in the private chat of the voter (if the vote prompt was sent there)
                // For day voting, the prompt is in the group chat. We might update it or send new messages.
                try {
                    if (msg.chat.id === votingPlayerId) {
                        // If original message was a PM to voter (not typical for day vote)
                        await bot.editMessageText(msg.text + `\n➡️ 你已投票给: @${target?.username || targetPlayerId}`, {
                            chat_id: msg.chat.id,
                            message_id: msg.message_id,
                            reply_markup: {inline_keyboard: []} // Remove keyboard for this voter
                        });
                    } else {
                        // Announce in group chat that player has voted
                        await ErrorHandler.handleSendMessageError(mainGameChatId, `@${voter?.username || votingPlayerId} 已投票。`);
                    }
                } catch (editError) {
                    ErrorHandler.logError(`edit_day_vote_message_error_${updatedGame.id}_${votingPlayerId}`, editError);
                }

                if (result.allVoted) {
                    // Announce vote results in main game chat
                    let voteResultMessage = "投票结束！\n";
                    if (updatedGame.lynchedPlayerId) {
                        const lynchedP = updatedGame.players.find((p) => p.id === updatedGame.lynchedPlayerId);
                        voteResultMessage += `玩家 @${lynchedP?.username || updatedGame.lynchedPlayerId} (${updatedGame.lynchedPlayerId}) 被公投出局。`;
                    } else {
                        voteResultMessage += "没有人被公投出局（平票或无人投票）。";
                    }
                    await ErrorHandler.handleSendMessageError(mainGameChatId, voteResultMessage);

                    // Game phase is now VOTE_RESULT. Advance to LAST_WORDS or NIGHT_START.
                    const phaseAdvanceResult = await gameService.advanceGamePhase(updatedGame.id);
                    if (typeof phaseAdvanceResult === "string") {
                        ErrorHandler.logError(`day_vote_phase_advance_error_${updatedGame.id}`, phaseAdvanceResult);
                        await ErrorHandler.handleSendMessageError(mainGameChatId, `处理投票结果后推进阶段失败: ${phaseAdvanceResult}`);
                    } else {
                        updatedGame = phaseAdvanceResult;
                        // TODO: Call a centralized handleGamePhaseChange(updatedGame, mainGameChatId) function here.
                        // For now, manually log or send basic info for next step based on updatedGame.phase
                        console.log(`[Bot] Game ${updatedGame.id} advanced to ${updatedGame.phase} after day vote results.`);
                        await ErrorHandler.handleSendMessageError(mainGameChatId, `游戏进入下一阶段: ${updatedGame.phase}`);
                    }
                }
            } else if (!result.success) {
                // Error already shown by answerCallbackQuery with show_alert: true
                ErrorHandler.logError(`day_vote_failed_${gameId}`, result.message);
            }
        } else {
            // Fallback for unhandled callback queries
            ErrorHandler.logError("unhandled_callback_query", `Unhandled callback query data: ${data}`);
            await bot.answerCallbackQuery(callbackQuery.id, {text: "未知操作"});
        }
    } catch (error) {
        ErrorHandler.logError("callback_query_handler", error); // 更新了錯誤上下文
        // 避免在 catch 塊中再次拋出錯誤導致未處理的 Promise rejection
        try {
            await ErrorHandler.handleCallbackQueryError(callbackQuery, "处理回调时发生严重错误。");
        } catch (e) {
            ErrorHandler.logError("callback_query_handler", "Failed to send error alert to user: " + e);
        }
    }
});

const handleHelpCommand = async (msg: TelegramBot.Message): Promise<void> => {
    if (!msg.chat?.id) return;

    try {
        const helpMessage = `以下是所有可用的命令：
- /switchmodel - 切换AI模型
- /switchrole - 切换AI角色
- /creategame - 创建狼人杀游戏
- /joingame - 加入狼人杀游戏
- /leavegame - 离开狼人杀游戏
- /startgame - 开始狼人杀游戏
- /myrole - 查看自己的角色
- /gamestatus - 查看游戏状态
- /helpgame - 查看游戏帮助信息`;

        await ErrorHandler.handleSendMessageError(msg.chat.id, helpMessage, {
            reply_to_message_id: msg.message_id
        });
    } catch (error) {
        await handleCommandError(error, msg, "发送帮助信息", "发送帮助信息时发生错误，请稍后重试");
    }
};

// 注册命令处理器
bot.onText(/\/switchmodel/, handleSwitchModelCommand);
bot.onText(/\/switchrole/, handleSwitchRoleCommand);
bot.onText(/\/creategame/, handleCreateGameCommand);
bot.onText(/\/help/, handleHelpCommand);

// 处理频率限制消息的辅助函数 - 使用ErrorHandler类方法
const handleRateLimitMessage = async (msg: TelegramBot.Message, errorMessage: string): Promise<void> => {
    try {
        await ErrorHandler.handleSendMessageError(msg.chat.id, errorMessage, {
            reply_to_message_id: msg.message_id
        });
    } catch (error) {
        ErrorHandler.logError("发送频率限制消息", error);
    }
};

// 处理用户消息
bot.on("message", async (msg) => {
    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        // Ensure msg.from and msg.text exist before proceeding
        if (msg.from?.id && msg.text) {
            const userId = msg.from.id;

            // 1. Check rate limit first
            if (!userManager.canSendMessage(userId)) {
                await handleRateLimitMessage(msg, "发送频率过高请在十秒后尝试");
                return;
            }

            const botUsername = "xinwiz_bot"; // TODO: Consider fetching this dynamically e.g. await bot.getMe()
            const mentionRegex = new RegExp(`^@${botUsername}\s+(.*)`); // Regex to capture text after mention
            const match = msg.text.match(mentionRegex);

            let textForAI: string | null = null;

            if (match && match[1]) {
                // Bot was mentioned. match[1] is the text after the mention.
                const contentAfterMention = match[1].trim();
                // Check if the content after mention is NOT a command
                if (contentAfterMention && !contentAfterMention.startsWith("/")) {
                    textForAI = contentAfterMention;
                }
                // If contentAfterMention starts with '/', it's a command like @bot /cmd.
                // textForAI will remain null, so the AI part below won't be triggered.
                // The bot.onText handler for the command should take over.
            } else if (!msg.text.startsWith("/")) {
                // This is a message in a group that is NOT a command and NOT a direct mention of the bot.
                // Based on the original logic (splitting by @xinwiz_bot), the bot in groups
                // should only respond to direct mentions for AI queries.
                // So, if it's not a mention and not a command, textForAI remains null.
            }
            // If msg.text.startsWith('/') and was not a mention, bot.onText handles it.

            if (textForAI) {
                try {
                    const model = userManager.getModel(userId);
                    const role = userManager.getRole(userId);
                    const response = await askAI(textForAI, {model, role});
                    if (response) {
                        await ErrorHandler.handleSendMessageError(msg.chat.id, response, {reply_to_message_id: msg.message_id});
                        userManager.updateMessageTime(userId);
                    }
                } catch (error) {
                    await ErrorHandler.handleCommandError(error, msg, "askAI", "调用AI时发生错误。");
                }
            }
        }
    }
});
// 定期清理不活跃用户数据（每24小时）
setInterval(() => {
    userManager.cleanInactiveUsers();
}, 24 * 60 * 60 * 1000);
