// src/keyboards.ts
import TelegramBot from 'node-telegram-bot-api';
import { Game, Player, Role, UserId, GamePhase, PlayerStatus } from './types';
import { CALLBACK_PREFIX_JOIN_GAME, CALLBACK_PREFIX_START_GAME, CALLBACK_PREFIX_VIEW_PLAYERS, CALLBACK_PREFIX_VOTE_PLAYER, CALLBACK_PREFIX_WEREWOLF_KILL, CALLBACK_PREFIX_SEER_CHECK, CALLBACK_PREFIX_WITCH_SAVE, CALLBACK_PREFIX_WITCH_POISON, ACTION_BUTTON_LABELS, CALLBACK_PREFIX_HUNTER_SHOOT } from './constants';

/**
 * 創建遊戲後的加入按鈕
 * @param gameId 遊戲 ID
 */
export const createJoinGameKeyboard = (gameId: string): TelegramBot.InlineKeyboardMarkup => {
  return {
    inline_keyboard: [
      [
        { text: '🙋 加入遊戲', callback_data: `${CALLBACK_PREFIX_JOIN_GAME}${gameId}` },
      ],
      [
        { text: '👀 查看玩家', callback_data: `${CALLBACK_PREFIX_VIEW_PLAYERS}${gameId}` },
      ],
    ],
  };
};

/**
 * 遊戲大廳鍵盤，包含開始遊戲按鈕 (僅房主可見)
 * @param gameId 遊戲 ID
 * @param isGameMaster 是否為房主
 */
export const createGameLobbyKeyboard = (gameId: string, isGameMaster: boolean): TelegramBot.InlineKeyboardMarkup => {
  const keyboard: TelegramBot.InlineKeyboardButton[][] = [
    [
      { text: '🙋 我要加入/退出', callback_data: `${CALLBACK_PREFIX_JOIN_GAME}${gameId}` }, // 加入和退出可以合併邏輯
      { text: '👀 查看當前玩家', callback_data: `${CALLBACK_PREFIX_VIEW_PLAYERS}${gameId}` },
    ],
  ];
  if (isGameMaster) {
    keyboard.push([
      { text: '▶️ 開始遊戲', callback_data: `${CALLBACK_PREFIX_START_GAME}${gameId}` },
    ]);
  }
  return { inline_keyboard: keyboard };
};

/**
 * 生成通用目標選擇鍵盤 (用於投票、狼人殺人、預言家查人等)
 * @param gameId 遊戲 ID
 * @param players 玩家列表 (通常是存活的玩家)
 * @param callbackPrefix 回調數據前綴
 * @param actionUserId 執行動作的玩家 ID (可選，用於排除自己)
 * @param filterSelf 是否過濾掉自己 (例如狼人不能刀自己，預言家不能查自己)
 */
export const createTargetSelectionKeyboard = (
  gameId: string,
  players: Player[],
  callbackPrefix: string,
  actionUserId?: UserId,
  filterSelf: boolean = false,
): TelegramBot.InlineKeyboardMarkup => {
  const inline_keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  const row: TelegramBot.InlineKeyboardButton[] = [];

  players.forEach(player => {
    if (filterSelf && player.id === actionUserId) {
      return; // 跳過自己
    }
    if (player.status === '存活') {
      row.push({
        text: player.username || `玩家${player.id}`,
        callback_data: `${callbackPrefix}${gameId}_${player.id}`,
      });
      if (row.length === 2) { // 每行最多2個按鈕，可調整
        inline_keyboard.push([...row]);
        row.length = 0;
      }
    }
  });

  if (row.length > 0) {
    inline_keyboard.push(row);
  }
  
  // 添加棄票/跳過按鈕 (視情況)
  if (callbackPrefix === CALLBACK_PREFIX_VOTE_PLAYER) {
    inline_keyboard.push([{
      text: ACTION_BUTTON_LABELS.SKIP_VOTE,
      callback_data: `${callbackPrefix}${gameId}_skip`
    }]);
  }
  // 狼人行動時沒有跳過，必須選擇目標
  // 預言家行動時通常也沒有跳過

  return { inline_keyboard };
};

/**
 * 創建狼人行動的目標選擇鍵盤
 * @param game 遊戲對象
 * @param werewolfId 執行操作的狼人ID
 */
export const createWerewolfActionKeyboard = (
  game: Game,
  werewolfId: UserId
): TelegramBot.InlineKeyboardMarkup => {
  const targetablePlayers = game.players.filter(
    player => player.status === PlayerStatus.ALIVE && 
              player.role !== Role.WEREWOLF &&
              player.id !== werewolfId // Though filtering by role !== WEREWOLF should cover this for the werewolf him/herself
  );

  // Note: The createTargetSelectionKeyboard already filters by player.status === '存活'
  // but it's good practice to ensure the list passed is already pre-filtered for clarity.
  // The `filterSelf` in createTargetSelectionKeyboard will also ensure the werewolfId is not an option.
  return createTargetSelectionKeyboard(
    game.id,
    targetablePlayers,
    CALLBACK_PREFIX_WEREWOLF_KILL,
    werewolfId, // Pass werewolfId as actionUserId to be potentially used by filterSelf
    true        // filterSelf: true, ensures the acting werewolf cannot target themselves
  );
};

/**
 * 女巫行動鍵盤
 * @param gameId 遊戲 ID
 * @param canUseSave 是否可以使用解藥
 * @param canUsePoison 是否可以使用毒藥
 * @param targetPlayerIdForSave 被狼人刀的玩家 ID (如果有，且女巫可救)
 */
export const createWitchActionKeyboard = (
  gameId: string,
  canUseSave: boolean,
  canUsePoison: boolean,
  targetPlayerIdForSave?: UserId,
): TelegramBot.InlineKeyboardMarkup => {
  const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

  if (canUseSave && targetPlayerIdForSave) {
    keyboard.push([
      {
        text: `${ACTION_BUTTON_LABELS.SAVE} (救 ${targetPlayerIdForSave})`,
        callback_data: `${CALLBACK_PREFIX_WITCH_SAVE}${gameId}_${targetPlayerIdForSave}`,
      },
    ]);
  }
  keyboard.push([
    {
      text: ACTION_BUTTON_LABELS.SKIP_SAVE,
      callback_data: `${CALLBACK_PREFIX_WITCH_SAVE}${gameId}_skip`,
    }
  ]);

  if (canUsePoison) {
    keyboard.push([
      {
        text: ACTION_BUTTON_LABELS.POISON,
        callback_data: `${CALLBACK_PREFIX_WITCH_POISON}${gameId}_select_target`, // 下一步是選擇目標
      },
    ]);
  }
  keyboard.push([
    {
      text: ACTION_BUTTON_LABELS.SKIP_POISON,
      callback_data: `${CALLBACK_PREFIX_WITCH_POISON}${gameId}_skip`,
    }
  ]);

  return { inline_keyboard: keyboard };
};

/**
 * 獵人開槍鍵盤
 * @param gameId 遊戲 ID
 * @param players 存活的玩家列表 (排除獵人自己)
 * @param hunterId 獵人ID
 */
export const createHunterShootKeyboard = (
    gameId: string,
    players: Player[],
    hunterId: UserId
): TelegramBot.InlineKeyboardMarkup => {
    const keyboard = createTargetSelectionKeyboard(gameId, players, CALLBACK_PREFIX_HUNTER_SHOOT, hunterId, true);
    // 獵人可以選擇不開槍
    if (keyboard.inline_keyboard) {
        keyboard.inline_keyboard.push([{
            text: ACTION_BUTTON_LABELS.SKIP_SHOOT,
            callback_data: `${CALLBACK_PREFIX_HUNTER_SHOOT}${gameId}_skip`
        }]);
    }
    return keyboard;
};
