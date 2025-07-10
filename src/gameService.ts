// src/gameService.ts
import { Game, Player, Role, UserId, GamePhase, PlayerStatus, ActionCallbackData, WerewolfActionResult, SeerActionResult } from './types';
import { ROLE_CONFIGURATIONS, MIN_PLAYERS, MAX_PLAYERS, MSG_MIN_PLAYERS_NOT_REACHED } from './constants';

// 輔助函數：隨機打亂數組 (Fisher-Yates shuffle)
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export class GameService {
  private activeGames: Map<string, Game> = new Map(); // 使用 Map 存儲活躍遊戲，key 為 gameId (通常是 chatId)

  /**
   * 創建一個新的狼人殺遊戲
   * @param chatId 群組 ID，也作為遊戲 ID
   * @param gameMasterId 房主 ID
   * @param gameMasterUsername 房主用戶名
   * @returns 返回創建的遊戲對象或錯誤信息字符串
   */
  public createGame(chatId: number, gameMasterId: UserId, gameMasterUsername: string): Game | string {
    const gameId = chatId.toString();
    if (this.activeGames.has(gameId)) {
      return '此聊天中已存在一個活躍遊戲。';
    }

    const initialPlayer: Player = {
      id: gameMasterId,
      username: gameMasterUsername,
      role: null,
      status: PlayerStatus.ALIVE,
      isGameMaster: true,
      votesReceived: [],
    };

    const game: Game = {
      id: gameId,
      players: [initialPlayer],
      gameMaster: gameMasterId,
      phase: GamePhase.SETUP,
      round: 0,
      rolesConfiguration: [], // 將在開始遊戲時確定
    };

    this.activeGames.set(gameId, game);
    console.log(`[GameService] 遊戲創建: ${gameId} by ${gameMasterUsername}`);
    return game;
  }

  /**
   * 玩家加入遊戲
   * @param gameId 遊戲 ID
   * @param playerId 玩家 ID
   * @param playerUsername 玩家用戶名
   * @returns 返回更新後的遊戲對象或錯誤信息字符串
   */
  public joinGame(gameId: string, playerId: UserId, playerUsername: string): Game | string {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return '未找到該遊戲。';
    }
    if (game.phase !== GamePhase.SETUP) {
      return '遊戲已經開始或已結束，無法加入。';
    }
    if (game.players.find(p => p.id === playerId)) {
      return '您已經在遊戲中了。';
    }
    if (game.players.length >= MAX_PLAYERS) {
      return '遊戲人數已滿。';
    }

    const newPlayer: Player = {
      id: playerId,
      username: playerUsername,
      role: null,
      status: PlayerStatus.ALIVE,
      isGameMaster: false,
      votesReceived: [],
    };
    game.players.push(newPlayer);
    console.log(`[GameService] 玩家加入: ${playerUsername} to game ${gameId}`);
    return game;
  }

  /**
   * 玩家離開遊戲
   * @param gameId 遊戲 ID
   * @param playerId 玩家 ID
   * @returns 返回更新後的遊戲對象或錯誤信息字符串
   */
  public leaveGame(gameId: string, playerId: UserId): Game | string {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return '未找到該遊戲。';
    }
    if (game.phase !== GamePhase.SETUP) {
      return '遊戲已經開始或已結束，無法離開。';
    }
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return '您不在該遊戲中。';
    }

    const leavingPlayer = game.players.splice(playerIndex, 1)[0];
    console.log(`[GameService] 玩家離開: ${leavingPlayer.username} from game ${gameId}`);

    // 如果房主離開，且遊戲中還有其他玩家，則將房主轉移給下一個加入的玩家
    if (leavingPlayer.isGameMaster && game.players.length > 0) {
      game.players[0].isGameMaster = true;
      game.gameMaster = game.players[0].id;
      console.log(`[GameService] 房主轉移: to ${game.players[0].username} in game ${gameId}`);
    } else if (game.players.length === 0) {
      // 如果所有人都離開了，結束遊戲
      this.endGame(gameId, "所有玩家已離開");
      return '所有玩家已離開，遊戲已自動結束。';
    }
    return game;
  }

  /**
   * 開始遊戲
   * @param gameId 遊戲 ID
   * @param requestingUserId 請求開始遊戲的用戶 ID
   * @returns 返回更新後的遊戲對象或錯誤信息字符串
   */
  public startGame(gameId: string, requestingUserId: UserId): Game | string {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return '未找到該遊戲。';
    }
    if (game.gameMaster !== requestingUserId) {
      return '只有房主才能開始遊戲。';
    }
    if (game.phase !== GamePhase.SETUP) {
      return '遊戲已經開始或已結束。';
    }
    if (game.players.length < MIN_PLAYERS) {
      return MSG_MIN_PLAYERS_NOT_REACHED(MIN_PLAYERS);
    }

    // 分配角色
    try {
        this.assignRoles(game);
    } catch (e: any) {
        // Log the detailed error for server-side debugging. Assuming ErrorHandler is available or import it.
        // For now, let's use console.error if ErrorHandler is not in this scope directly.
        console.error(`[GameService] startGame Error during assignRoles for game ${gameId}: ${e.message}`);
        // Return a user-friendly error message
        return e.message || '角色配置错误，无法开始游戏。';
    }
    game.phase = GamePhase.NIGHT_START; // 或者直接到第一個行動階段，如狼人行動
    game.round = 1;
    console.log(`[GameService] 遊戲開始: ${gameId}. 角色已分配.`);
    // TODO: 觸發夜晚開始的邏輯，例如通知狼人互相認識，並提示第一個行動的角色
    return game;
  }

  /**
   * 為遊戲中的玩家分配角色
   * @param game 遊戲對象
   */
  private assignRoles(game: Game): void {
    const playerCount = game.players.length;
    let rolesToAssign = ROLE_CONFIGURATIONS[playerCount];

    if (!rolesToAssign) {
      // 如果沒有精確匹配的人數配置，可以選擇一個最接近的或拋出錯誤
      // 這裡簡單使用一個通用配置或提示錯誤
      console.error(`[GameService] 缺少 ${playerCount} 人的角色配置!`);
      // 可以選擇一個默認配置，或者讓遊戲無法開始
      // 為了演示，我們假設如果沒有配置，則隨機分配 (這不是一個好的做法)
      // 實際應用中應該有所有支持人數的配置
      // rolesToAssign = this.getDefaultRoles(playerCount);
      // For now, let's prevent starting if no config
      throw new Error(`缺少 ${playerCount} 人的角色配置!`);
    }

    rolesToAssign = shuffleArray([...rolesToAssign]); // 複製並打亂角色列表

    game.players.forEach((player, index) => {
      player.role = rolesToAssign[index % rolesToAssign.length]; // 確保角色數量不足時循環分配
      player.votesReceived = []; // 重置投票記錄
    });
    game.rolesConfiguration = rolesToAssign;
  }

  /**
   * 獲取指定遊戲的信息
   * @param gameId 遊戲 ID
   */
  public getGame(gameId: string): Game | undefined {
    return this.activeGames.get(gameId);
  }

  /**
   * 处理预言家查验玩家身份的行动
   * @param gameId 游戏ID
   * @param seerUserId 执行操作的预言家ID
   * @param targetPlayerId 被查验的目标玩家ID
   * @returns SeerActionResult 对象或错误消息字符串
   */
  public async seerAction(gameId: string, seerUserId: UserId, targetPlayerId: UserId): Promise<SeerActionResult | string> {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return "游戏未找到。";
    }

    if (game.phase !== GamePhase.SEER_ACTION) {
      return "现在不是预言家行动时间。";
    }

    const seer = game.players.find(p => p.id === seerUserId);
    if (!seer || seer.role !== Role.SEER || seer.status !== PlayerStatus.ALIVE) {
      return "你不是存活的预言家，无法执行此操作。";
    }

    // 检查预言家本回合是否已行动 (基于 seerActionDetails 是否记录了本轮的查验)
    if (game.seerActionDetails && game.seerActionDetails.round === game.round && game.seerActionDetails.seerId === seerUserId) {
        return "你本回合已经查验过了。";
    }

    const targetPlayer = game.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      return "目标玩家未找到。";
    }
    if (targetPlayer.status !== PlayerStatus.ALIVE) {
      return "目标玩家已死亡，无法查验。";
    }
    if (targetPlayer.id === seerUserId) {
      return "你不能查验自己。";
    }

    // 确定目标身份用于告知预言家
    const targetRoleDisplay = targetPlayer.role || "未知身份"; // 正常情况下角色不会为null

    // 记录查验结果
    game.seerActionDetails = {
      round: game.round,
      seerId: seerUserId,
      targetId: targetPlayerId,
      targetRole: targetPlayer.role!, // 此时 targetPlayer.role 不应为 null
    };
    
    console.log(`[GameService] 预言家行动: ${seer.username} (ID: ${seerUserId}) 查验了 ${targetPlayer.username} (ID: ${targetPlayerId}), 结果: ${targetRoleDisplay}. Game: ${gameId}`);

    const privateMessageForSeer = `你查验的玩家 @${targetPlayer.username || targetPlayer.id} 的身份是：【${targetRoleDisplay}】。`;

    // 尝试推进游戏阶段
    const advanceResult = await this.advanceGamePhase(gameId);
    let phaseChanged = false;
    let nextPhaseMessage = "";

    if (typeof advanceResult === 'string') {
        console.error(`[GameService] seerAction - Error advancing phase for game ${gameId} after seer action: ${advanceResult}`);
        nextPhaseMessage = `查验完成。但阶段推进时发生错误: ${advanceResult}`;
    } else {
        Object.assign(game, advanceResult); // 更新当前 game 实例的状态
        phaseChanged = game.phase !== GamePhase.SEER_ACTION;
        if (phaseChanged) {
            nextPhaseMessage = `查验完成。游戏进入 ${game.phase} 阶段。`;
        } else {
            nextPhaseMessage = "查验完成。等待其他行动或条件满足以推进阶段。";
        }
    }
    
    return {
      success: true,
      message: "查验成功。结果已通过私聊发送给你。", // 通用回调消息
      privateMessageForSeer: privateMessageForSeer,
      game: game,
      phaseChanged: phaseChanged,
    };
  }

  /**
   * 設置遊戲大廳消息ID，用於後續編輯
   * @param gameId 遊戲 ID
   * @param messageId 消息 ID
   * @returns 是否成功設置
   */
  public setLobbyMessageId(gameId: string, messageId: number): boolean {
    const game = this.activeGames.get(gameId);
    if (game) {
        game.messageIdToEdit = messageId;
        console.log(`[GameService] Lobby message ID set for game ${gameId}: ${messageId}`);
        return true;
    }
    console.warn(`[GameService] Failed to set lobby message ID for game ${gameId}: Game not found.`);
    return false;
  }

  /**
   * 結束遊戲
   * @param gameId 遊戲 ID
   * @param reason 結束原因
   */
  public endGame(gameId: string, reason: string): boolean {
    if (this.activeGames.has(gameId)) {
      this.activeGames.delete(gameId);
      console.log(`[GameService] 遊戲結束: ${gameId}. 原因: ${reason}`);
      return true;
    }
    return false;
  }

  /**
   * 處理狼人投票殺人的動作。
   * 記錄每個狼人的選擇，並在所有狼人投票後決定最終目標。
   * @param gameId 遊戲 ID
   * @param votingWerewolfId 投票的狼人 ID
   * @param targetPlayerId 目標玩家 ID
   * @returns WerewolfActionResult 包含操作結果和遊戲狀態更新
   */
  public werewolfVoteKill(gameId: string, votingWerewolfId: UserId, targetPlayerId: UserId): WerewolfActionResult {
    const game = this.activeGames.get(gameId);
    if (!game) {
        return { success: false, message: "未找到该游戏。", allWerewolvesVoted: false, game: undefined };
    }

    const votingPlayer = game.players.find(p => p.id === votingWerewolfId);
    if (!votingPlayer || votingPlayer.role !== Role.WEREWOLF || votingPlayer.status !== PlayerStatus.ALIVE) {
        return { success: false, message: "你不是存活的狼人，无法行动。", allWerewolvesVoted: false, game: game };
    }

    const targetPlayer = game.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer || targetPlayer.status !== PlayerStatus.ALIVE) {
        return { success: false, message: "目标玩家无效或已死亡。", allWerewolvesVoted: false, game: game };
    }
    // 允许狼人选择自己人为目标，但在某些规则下可能不允许，这里暂时允许，如果需要严格禁止，可以取消注释下一行
    // if (targetPlayer.role === Role.WEREWOLF) {
    //     return { success: false, message: "通常情况下，狼人不能选择其他狼人作为目标。", allWerewolvesVoted: false, game: game };
    // }

    if (!game.werewolfChoices) {
        game.werewolfChoices = new Map<UserId, UserId>();
    }
    game.werewolfChoices.set(votingWerewolfId, targetPlayerId);
    const targetUsername = targetPlayer.username || targetPlayer.id.toString();
    console.log(`[GameService] Game ${gameId}: Werewolf ${votingPlayer.username || votingWerewolfId} voted for ${targetUsername}. Choices: ${Array.from(game.werewolfChoices.entries()).map(([k,v]) => `${k}=>${v}`).join(', ')}`);

    const aliveWerewolves = game.players.filter(p => p.role === Role.WEREWOLF && p.status === PlayerStatus.ALIVE);
    const allVoted = game.werewolfChoices.size === aliveWerewolves.length;

    if (allVoted) {
        // 决定最终目标
        // 策略：统计票数，票数最多的成为目标。如果平票，则无目标（或按房主设置，或随机等）。
        // 当前简化：如果所有狼人选择一致，则该目标为最终目标；否则，本夜无明确目标（nightlyTargetedPlayerId 保持 undefined）
        // 或者，可以采纳最后一个投票者的选择，或者随机选择一个。
        // 这里我们采取：如果所有选择都相同，则采纳；否则，为了演示，我们让最后一个投票者（即当前的 targetPlayerId）决定。
        const votes = Array.from(game.werewolfChoices.values());
        const voteCounts = new Map<UserId, number>();
        let maxVotes = 0;
        let finalTarget: UserId | undefined = undefined;
        let multipleTargetsWithMaxVotes = false;

        for (const vote of votes) {
            const currentCount = (voteCounts.get(vote) || 0) + 1;
            voteCounts.set(vote, currentCount);
            if (currentCount > maxVotes) {
                maxVotes = currentCount;
                finalTarget = vote;
                multipleTargetsWithMaxVotes = false;
            } else if (currentCount === maxVotes) {
                multipleTargetsWithMaxVotes = true;
            }
        }
        
        // 如果最高票数者唯一，则设定为目标
        if (finalTarget !== undefined && !multipleTargetsWithMaxVotes) {
            game.nightlyTargetedPlayerId = finalTarget;
        } else {
            // 如果平票或无投票，则当夜无明确目标 (或者根据游戏规则采取其他策略，比如随机选择一个最高票目标，或最后一个投票者决定)
            // 为简单起见，如果平票，则本轮可能没有唯一目标，或者随机选择一个。这里我们暂时不设定目标。
            // 或者，如果需要，可以设置 game.nightlyTargetedPlayerId = undefined;
            // 或者，如果规则是最后一个投票者在平票时决定，则： game.nightlyTargetedPlayerId = targetPlayerId;
            console.log(`[GameService] Game ${gameId}: Werewolf votes resulted in a tie or no consensus. Final target based on rules (e.g., last vote, random, or no target). Currently set to: ${targetPlayerId} (last vote as fallback).`);
            game.nightlyTargetedPlayerId = targetPlayerId; // 作为平票时的简单回退
        }
        
        const finalTargetPlayer = game.players.find(p => p.id === game.nightlyTargetedPlayerId);
        const finalTargetUsername = finalTargetPlayer?.username || game.nightlyTargetedPlayerId?.toString() || '无';

        console.log(`[GameService] Game ${gameId}: All ${aliveWerewolves.length} werewolves voted. Final target for tonight: ${finalTargetUsername}.`);
        
        // 狼人行动结束，准备进入下一个阶段 (例如预言家)
        return { 
            success: true, 
            message: `你的选择 (@${targetUsername}) 已记录。所有狼人已行动完毕，目标锁定为 @${finalTargetUsername}。`, 
            allWerewolvesVoted: true, 
            finalTargetId: game.nightlyTargetedPlayerId,
            nextPhase: GamePhase.SEER_ACTION, // 示例：下一个阶段是预言家
            game: game,
            targetUsername: targetUsername
        };
    } else {
        const remainingVotes = aliveWerewolves.length - game.werewolfChoices.size;
        return { 
            success: true, 
            message: `你的选择 (@${targetUsername}) 已记录。等待其他 ${remainingVotes} 名狼人行动...`, 
            allWerewolvesVoted: false,
            game: game,
            targetUsername: targetUsername
        };
    }
  }

  /**
   * 獲取玩家在指定遊戲中的角色
   * @param gameId 遊戲 ID
   * @param playerId 玩家 ID
   */
  public getPlayerRole(gameId: string, playerId: UserId): Role | string | null {
    const game = this.getGame(gameId);
    if (!game) return '未找到遊戲。';
    const player = game.players.find(p => p.id === playerId);
    if (!player) return '玩家未在此遊戲中。';
    return player.role;
  }

  public async recordDayVote(gameId: string, voterId: UserId, targetId: UserId): Promise<{ success: boolean; message: string; game?: Game; allVoted?: boolean }> {
    const game = this.activeGames.get(gameId);
    if (!game) return { success: false, message: '未找到遊戲。' };

    if (game.phase !== GamePhase.VOTING) {
      return { success: false, message: '現在不是投票階段。' };
    }

    const voter = game.players.find(p => p.id === voterId);
    if (!voter || voter.status !== PlayerStatus.ALIVE) {
      return { success: false, message: '投票者無效或已死亡。' };
    }

    const target = game.players.find(p => p.id === targetId);
    if (!target || target.status !== PlayerStatus.ALIVE) {
      // Allow voting for dead players? Typically no for lynching.
      return { success: false, message: '投票目標無效或已死亡。' };
    }

    if (!game.dayVotes) {
        game.dayVotes = new Map<UserId, UserId>(); // Should have been initialized by advancePhase
    }
    game.dayVotes.set(voterId, targetId);
    this.activeGames.set(gameId, game); // Save vote

    const alivePlayersCount = game.players.filter(p => p.status === PlayerStatus.ALIVE).length;
    const allVoted = game.dayVotes.size === alivePlayersCount;

    if (allVoted) {
      const updatedGameOrMessage = await this.advanceGamePhase(gameId);
      if (typeof updatedGameOrMessage === 'string') {
        return { success: false, message: `投票完成，但推進階段時發生錯誤: ${updatedGameOrMessage}`, allVoted: true };
      }
      return { success: true, message: '投票成功，所有玩家已投票，正在進入結果階段。', game: updatedGameOrMessage, allVoted: true };
    }

    return { success: true, message: '投票成功。等待其他玩家投票。', game, allVoted: false };
  }

  // --- 接下來是處理遊戲流程和玩家動作的複雜邏輯 ---
  // 例如: handleNightActions, handleVoting, determineWinners 等
  // 這些將在後續步驟中逐步實現

  /**
   * 處理夜晚結算
   * @param game 遊戲對象
   */
  private settleNightActions(game: Game): void {
    // This is a placeholder for the complex logic of night settlement.
    // It should check game.nightlyTargetedPlayerId, witch actions, etc.
    // and update player statuses.
    const targetId = game.nightlyTargetedPlayerId;
    if (targetId) {
        const targetPlayer = game.players.find(p => p.id === targetId);
        if (targetPlayer) {
            // In a real game, check for witch's save here.
            targetPlayer.status = PlayerStatus.DEAD;
            game.lastNightKilled = game.lastNightKilled || [];
            game.lastNightKilled.push(targetPlayer);
            console.log(`[Game ${game.id}] Player ${targetPlayer.id} was killed by werewolves.`);
        }
    }
  }

  /**
   * 推進遊戲到下一個階段
   * @param gameId 遊戲 ID
   */
  public async advanceGamePhase(gameId: string): Promise<Game | string> {
    const game = this.activeGames.get(gameId);
    if (!game) return '未找到遊戲。';

    let nextPhase: GamePhase = game.phase;

    switch (game.phase) {
        case GamePhase.SETUP:
            return '遊戲尚未開始，請先開始遊戲。';

        case GamePhase.NIGHT_START:
            game.round++;
            game.werewolfChoices = new Map<UserId, UserId>();
            game.nightlyTargetedPlayerId = undefined;
            // Reset other night actions details here if necessary

            if (game.players.some(p => p.role === Role.WEREWOLF && p.status === PlayerStatus.ALIVE)) {
                nextPhase = GamePhase.WEREWOLF_ACTION;
            } else if (game.players.some(p => p.role === Role.SEER && p.status === PlayerStatus.ALIVE)) {
                nextPhase = GamePhase.SEER_ACTION;
            } else if (game.players.some(p => p.role === Role.WITCH && p.status === PlayerStatus.ALIVE)) {
                nextPhase = GamePhase.WITCH_ACTION;
            } else {
                nextPhase = GamePhase.DAY_START;
            }
            break;

        case GamePhase.WEREWOLF_ACTION:
            const aliveWerewolves = game.players.filter(p => p.role === Role.WEREWOLF && p.status === PlayerStatus.ALIVE);
            if (aliveWerewolves.length > 0 && game.werewolfChoices?.size !== aliveWerewolves.length) {
                return `等待所有 ${aliveWerewolves.length} 名狼人行动...`;
            }

            this.settleNightActions(game);

            // Fall-through to find next phase
            if (game.players.some(p => p.role === Role.SEER && p.status === PlayerStatus.ALIVE)) {
                nextPhase = GamePhase.SEER_ACTION;
            } else if (game.players.some(p => p.role === Role.WITCH && p.status === PlayerStatus.ALIVE)) {
                nextPhase = GamePhase.WITCH_ACTION;
            } else {
                nextPhase = GamePhase.DAY_START;
            }
            break;

        case GamePhase.SEER_ACTION:
            const seer = game.players.find(p => p.role === Role.SEER && p.status === PlayerStatus.ALIVE);
            if (seer && (!game.seerActionDetails || game.seerActionDetails.round !== game.round)) {
                return `等待預言家行动...`;
            }
            // Fall-through to find next phase
            if (game.players.some(p => p.role === Role.WITCH && p.status === PlayerStatus.ALIVE)) {
                nextPhase = GamePhase.WITCH_ACTION;
            } else {
                nextPhase = GamePhase.DAY_START;
            }
            break;

        case GamePhase.WITCH_ACTION:
            // TODO: Add logic to check if witch has acted
            nextPhase = GamePhase.DAY_START;
            break;

        case GamePhase.DAY_START:
            const endCheckDayStart = this.checkGameEnd(game);
            if (endCheckDayStart.gameOver) {
                nextPhase = GamePhase.GAME_OVER;
                game.winner = endCheckDayStart.winner;
            } else {
                nextPhase = GamePhase.DISCUSSION;
            }
            break;

        case GamePhase.DISCUSSION:
            nextPhase = GamePhase.VOTING;
            game.dayVotes = new Map<UserId, UserId>();
            game.lynchedPlayerId = null;
            game.players.forEach(p => p.votesReceived = []);
            break;

        case GamePhase.VOTING:
            const alivePlayersCount = game.players.filter(p => p.status === PlayerStatus.ALIVE).length;
            if (game.dayVotes?.size !== alivePlayersCount) {
                return `等待所有 ${alivePlayersCount} 名存活玩家投票...`;
            }
            // Process votes
            const voteCounts = new Map<UserId, number>();
            for (const targetId of game.dayVotes.values()) {
                voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
            }
            let maxVotes = 0;
            let lynchedCandidates: UserId[] = [];
            voteCounts.forEach((count, playerId) => {
                if (count > maxVotes) {
                    maxVotes = count;
                    lynchedCandidates = [playerId];
                } else if (count === maxVotes) {
                    lynchedCandidates.push(playerId);
                }
            });

            if (lynchedCandidates.length === 1) {
                game.lynchedPlayerId = lynchedCandidates[0];
                const lynchedPlayer = game.players.find(p => p.id === game.lynchedPlayerId);
                if (lynchedPlayer) lynchedPlayer.status = PlayerStatus.DEAD;
            } else {
                game.lynchedPlayerId = null;
            }
            nextPhase = GamePhase.VOTE_RESULT;
            break;

        case GamePhase.VOTE_RESULT:
            const endCheckVoteResult = this.checkGameEnd(game);
            if (endCheckVoteResult.gameOver) {
                nextPhase = GamePhase.GAME_OVER;
                game.winner = endCheckVoteResult.winner;
            } else if (game.lynchedPlayerId !== null) {
                nextPhase = GamePhase.LAST_WORDS;
            } else {
                nextPhase = GamePhase.NIGHT_START;
            }
            break;

        case GamePhase.LAST_WORDS:
            const endCheckLastWords = this.checkGameEnd(game);
            if (endCheckLastWords.gameOver) {
                nextPhase = GamePhase.GAME_OVER;
                game.winner = endCheckLastWords.winner;
            } else {
                nextPhase = GamePhase.NIGHT_START;
            }
            break;

        case GamePhase.GAME_OVER:
            this.endGame(gameId, `遊戲結束，勝利者: ${game.winner}`);
            return '遊戲已經結束。';

        default:
            console.warn(`[GameService] advanceGamePhase called with unhandled phase: ${game.phase}`);
            return '未知的遊戲階段。';
    }

    game.phase = nextPhase;
    this.activeGames.set(gameId, game);
    console.log(`[GameService] Game ${gameId} advanced to phase: ${game.phase}`);
    
    if (game.phase === GamePhase.GAME_OVER) {
        this.endGame(gameId, `遊戲結束，勝利者: ${game.winner}`);
    }

    return game;
  }

  /**
   * 檢查遊戲是否結束，並確定勝利方
   * @param game 遊戲對象
   * @returns 返回是否結束及勝利方 (Role.WEREWOLF 或 Role.VILLAGER)
   */
  public checkGameEnd(game: Game): { gameOver: boolean; winner?: Role } {
    const alivePlayers = game.players.filter(p => p.status === PlayerStatus.ALIVE);
    const aliveWerewolves = alivePlayers.filter(p => p.role === Role.WEREWOLF);
    const aliveVillagers = alivePlayers.filter(p => p.role !== Role.WEREWOLF); // 包括所有神民和村民

    if (aliveWerewolves.length === 0) {
      return { gameOver: true, winner: Role.VILLAGER }; // 所有狼人出局，村民勝利
    }
    if (aliveWerewolves.length >= aliveVillagers.length) {
      return { gameOver: true, winner: Role.WEREWOLF }; // 狼人數量達到或超過好人數量，狼人勝利
    }
    // TODO: 其他勝利條件，例如屠邊局 (殺光所有神或所有民)

    return { gameOver: false };
  }
  
  // TODO: 添加處理玩家具體動作的方法，例如：
  // handleWerewolfKill, handleSeerCheck, handleWitchAction, handleVote
  // 這些方法會修改 game 對象的狀態，例如記錄被刀/查/救/毒的玩家，記錄投票
}
