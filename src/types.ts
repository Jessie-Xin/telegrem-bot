// src/types.ts

/**
 * 玩家在 Telegram 中的用戶 ID
 */
export type UserId = number;

/**
 * 遊戲中玩家的角色
 */
export enum Role {
  WEREWOLF = '狼人',
  VILLAGER = '村民',
  SEER = '預言家',
  WITCH = '女巫',
  HUNTER = '獵人',
  // 可以根據需要添加更多角色
  // GUARD = '守衛',
  // IDIOT = '白痴',
}

/**
 * 玩家的狀態
 */
export enum PlayerStatus {
  ALIVE = '存活',
  DEAD = '死亡',
  // WITCH_POISONED = '被毒殺', // 女巫毒藥狀態
  // HUNTER_SHOT = '被獵殺', // 獵人開槍狀態
}

/**
 * 遊戲玩家對象
 */
export interface Player {
  id: UserId;                // Telegram 用戶 ID
  username?: string;         // Telegram 用戶名
  role: Role | null;         // 玩家在遊戲中的角色，初始為 null
  status: PlayerStatus;      // 玩家狀態，初始為存活
  isGameMaster?: boolean;    // 是否為房主
  votesReceived?: UserId[];  // 本輪收到的投票者 ID
  // 可以添加更多角色特定狀態，例如：
  // witchSaveUsed?: boolean; // 女巫的解藥是否已使用
  // witchPoisonUsed?: boolean; // 女巫的毒藥是否已使用
  // hunterCanShoot?: boolean; // 獵人是否可以開槍
}

/**
 * 遊戲的不同階段
 */
export enum GamePhase {
  SETUP = '設置中',          // 遊戲創建，等待玩家加入
  NIGHT_START = '夜晚開始',
  WEREWOLF_ACTION = '狼人行動',
  SEER_ACTION = '預言家行動',
  WITCH_ACTION = '女巫行動',
  // GUARD_ACTION = '守衛行動',
  DAY_START = '白天開始',      // 天亮，宣布昨夜死訊
  DISCUSSION = '討論階段',
  VOTING = '投票階段',
  VOTE_RESULT = '投票結果',
  LAST_WORDS = '遺言階段',
  GAME_OVER = '遊戲結束',
}

/**
 * 遊戲對象
 */
export interface Game {
  id: string;                      // 遊戲的唯一標識符 (例如群組 ID)
  players: Player[];               // 參與遊戲的玩家列表
  gameMaster: UserId;              // 創建遊戲的玩家 ID (房主)
  phase: GamePhase;                // 當前遊戲階段
  round: number;                   // 當前遊戲輪次
  rolesConfiguration: Role[];      // 本局遊戲的角色配置
  messageIdToEdit?: number;       // 需要編輯的遊戲狀態消息 ID
  nightlyTargetedPlayerId?: UserId; // 狼人夜晚投票的目標玩家ID
  werewolfChoices?: Map<UserId, UserId>; // 記錄本夜狼人各自的選擇 <UserId(狼人), UserId(目标)>
  dayVotes?: Map<UserId, UserId>; // 記錄白天投票情況 <UserId(投票者), UserId(被投票者)>
  lynchedPlayerId?: UserId | null; // 本輪白天被投票出局的玩家ID
  winner?: Role | null;         // 遊戲勝利者陣營，null 表示平局或未結束
  lastNightKilled?: Player[];         // 昨晚被殺死的玩家列表
  seerActionDetails?: {          // 記錄本回合預言家查驗的詳細信息
    round: number;
    seerId: UserId;
    targetId: UserId;
    targetRole: Role; // 或者更簡化的陣營信息 string, e.g., '好人' / '狼人'
  };
  // 可以添加更多遊戲狀態信息，例如：
  // werewolfTargets?: { [werewolfId: UserId]: UserId }; // 狼人本回合的目標
  // seerCheckedPlayer?: Player; // 預言家本回合查看的玩家
  // witchSavedPlayer?: UserId; // 女巫本回合拯救的玩家
  // witchPoisonedPlayer?: UserId; // 女巫本回合毒殺的玩家
  // votedOutPlayer?: Player; // 本輪被投票出局的玩家
}

/**
 * 投票記錄
 */
export interface VoteRecord {
  voterId: UserId;
  targetId: UserId;
}

/**
 * 動作按鈕的回調數據結構
 */
export interface ActionCallbackData {
  action: string; // 例如 'vote', 'kill', 'check', 'save', 'poison'
  gameId: string;
  targetUserId?: UserId;
  // 其他需要的參數
}

// 定义狼人行动结果接口
export interface WerewolfActionResult {
    success: boolean;
    message: string; // 给用户的反馈信息
    allWerewolvesVoted: boolean; // 是否所有狼人都已投票
    finalTargetId?: UserId; // 如果所有狼人已投票，最终的目标ID
    nextPhase?: GamePhase; // 如果狼人行动结束，下一个游戏阶段
    game?: Game; // 更新后的游戏对象，bot.ts 可能需要
    targetUsername?: string; // 目标玩家的用户名，用于反馈消息
}

/**
 * 预言家行动结果接口
 */
export interface SeerActionResult {
    success: boolean;
    message: string; // 回调查询的通用消息，例如 "查验成功，结果已私发"
    privateMessageForSeer?: string; // 发送给预言家的私聊消息，包含查验结果
    game?: Game; // 更新后的游戏对象
    phaseChanged?: boolean; // 游戏阶段是否因此次行动而改变
    // nextPhase?: GamePhase; // 如果 phaseChanged 为 true，新的阶段是什么 (可选, game.phase 会更新)
}
