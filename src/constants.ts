// src/constants.ts
import { Role } from './types';

// 命令名稱
export const COMMAND_CREATE_GAME = 'creategame';
export const COMMAND_JOIN_GAME = 'joingame';
export const COMMAND_LEAVE_GAME = 'leavegame';
export const COMMAND_START_GAME = 'startgame';
export const COMMAND_END_GAME = 'endgame'; // 主動結束遊戲（房主或管理員）
export const COMMAND_MY_ROLE = 'myrole'; // 查看自己的身份
export const COMMAND_GAME_STATUS = 'gamestatus'; // 查看遊戲狀態
export const COMMAND_VOTE = 'vote'; // 投票指令（備用，主要通過按鈕）
export const COMMAND_HELP_GAME = 'helpgame'; // 遊戲幫助

// 回調數據前綴 (用於 inline keyboard)
export const CALLBACK_PREFIX_JOIN_GAME = 'join_';
export const CALLBACK_PREFIX_VIEW_PLAYERS = 'view_players_';
export const CALLBACK_PREFIX_WEREWOLF_KILL = 'ww_kill_'; // Werewolf kill action
export const CALLBACK_PREFIX_SEER_CHOOSE = 'seer_choose_'; // Seer choose action
export const CALLBACK_PREFIX_START_GAME = 'start_game_';
export const CALLBACK_PREFIX_ACTION = 'action_'; // 通用動作前綴
export const CALLBACK_PREFIX_VOTE_PLAYER = 'vote_player_';
export const CALLBACK_PREFIX_SEER_CHECK = 'check_';
export const CALLBACK_PREFIX_DAY_VOTE = 'day_vote_'; // Added for daytime voting
export const CALLBACK_PREFIX_WITCH_SAVE = 'save_';
export const CALLBACK_PREFIX_WITCH_POISON = 'poison_';
export const CALLBACK_PREFIX_HUNTER_SHOOT = 'shoot_';

// 遊戲消息和提示
export const MSG_GAME_CREATED = (gameId: string, gameMasterUsername: string) => 
  `狼人殺遊戲已創建！房主: @${gameMasterUsername}。
遊戲ID: ${gameId}
點擊下方按鈕加入遊戲👇`;
export const MSG_PLAYER_JOINED = (username: string) => `@${username} 已加入遊戲！`;
export const MSG_PLAYER_LEFT = (username: string) => `@${username} 已離開遊戲。`;
export const MSG_GAME_NOT_FOUND = '未找到對應的遊戲。';
export const MSG_ALREADY_IN_GAME = '您已經在一局遊戲中。';
export const MSG_NOT_IN_GAME = '您尚未加入任何遊戲。';
export const MSG_GAME_FULL = '抱歉，遊戲人數已滿。';
export const MSG_GAME_STARTED_CANNOT_JOIN = '遊戲已經開始，無法加入。';
export const MSG_GAME_STARTED_CANNOT_LEAVE = '遊戲已經開始，無法離開。';
export const MSG_NOT_GAME_MASTER = '您不是房主，無法執行此操作。';
export const MSG_GAME_STARTING = '遊戲即將開始，正在分配角色...';
export const MSG_MIN_PLAYERS_NOT_REACHED = (min: number) => `至少需要 ${min} 名玩家才能開始遊戲。`;
export const MSG_GAME_ENDED_BY_MASTER = '房主已結束本局遊戲。';
export const MSG_ROLE_ASSIGNED_PRIVATE = (role: Role) => `你在本局遊戲中的身份是：【${role}】`;

// 角色配置 (示例，可以根據玩家數量調整)
// Key 是玩家數量, Value 是角色列表
export const ROLE_CONFIGURATIONS: { [key: number]: Role[] } = {
  2: [Role.WEREWOLF, Role.VILLAGER], // 2人配置 - 1狼人, 1村民 (主要用于测试)
  5: [Role.WEREWOLF, Role.WEREWOLF, Role.SEER, Role.WITCH, Role.VILLAGER],
  6: [Role.WEREWOLF, Role.WEREWOLF, Role.SEER, Role.WITCH, Role.VILLAGER, Role.VILLAGER],
  7: [Role.WEREWOLF, Role.WEREWOLF, Role.SEER, Role.WITCH, Role.HUNTER, Role.VILLAGER, Role.VILLAGER],
  8: [Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.SEER, Role.WITCH, Role.HUNTER, Role.VILLAGER, Role.VILLAGER],
  // 可以添加更多人數配置
  // 注意：2人局的平衡性可能较差，主要用于快速测试游戏流程
};

export const MIN_PLAYERS = 2; // 開始遊戲的最小玩家數
export const MAX_PLAYERS = 12; // 遊戲的最大玩家數 (可調整)

// 遊戲動作按鈕標籤
export const ACTION_BUTTON_LABELS = {
  KILL: '🔪 刀人',
  CHECK: '🔍查驗',
  SAVE: '💖救人',
  POISON: '☠️下毒',
  SKIP_SAVE: '🤷不救',
  SKIP_POISON: '🤷不毒',
  SHOOT: '🔫開槍',
  SKIP_SHOOT: '🤷不開槍',
  VOTE: '🗳️投票',
  SKIP_VOTE: '🤷棄票',
};
