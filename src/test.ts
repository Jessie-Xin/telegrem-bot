// src/test.ts
import { GameService } from './gameService';
import { Role, UserId, GamePhase } from './types';

// Helper function to create a delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function runTest() {
  console.log('--- 启动游戏流程测试 ---');

  const gameService = new GameService();
  const gameId = '123';
  const gameMasterId = 1;

  // 1. 创建游戏
  console.log('\nStep 1: 创建游戏');
  gameService.createGame(parseInt(gameId), gameMasterId, 'GameMaster');
  console.log(`游戏 ${gameId} 已创建。`);

  // 2. 玩家加入
  console.log('\nStep 2: 玩家加入');
  const player2 = { id: 2, username: 'Player2' };
  gameService.joinGame(gameId, player2.id, player2.username);
  console.log(`2 名玩家已加入游戏。`);
  let game = gameService.getGame(gameId)!;
  console.log('当前玩家:', game.players.map(p => p.username).join(', '));

  // 3. 开始游戏并分配角色
  console.log('\nStep 3: 开始游戏');
  const startGameResult = gameService.startGame(gameId, gameMasterId);
  if (typeof startGameResult === 'string') {
    console.error('开始游戏失败:', startGameResult);
    return;
  }
  game = gameService.getGame(gameId)!;
  console.log('游戏已开始！当前阶段:', game.phase);
  console.log('角色分配:');
  game.players.forEach(p => console.log(`  - ${p.username}: ${p.role}`));

  // 4. 推进到夜晚
  console.log('\nStep 4: 进入夜晚');
  let advanceResult = await gameService.advanceGamePhase(gameId);
  if (typeof advanceResult === 'string') {
    console.error('推进失败:', advanceResult);
    return;
  }
  game = gameService.getGame(gameId)!;
  console.log('游戏阶段推进到:', game.phase);

  // 5. 狼人行动
  console.log('\nStep 5: 狼人行动');
  const werewolves = game.players.filter(p => p.role === Role.WEREWOLF);
  const target = game.players.find(p => p.role !== Role.WEREWOLF)!;
  if (werewolves.length > 0) {
    for (const wolf of werewolves) {
      console.log(`  狼人 ${wolf.username} 投票给 ${target.username}`);
      gameService.werewolfVoteKill(gameId, wolf.id, target.id);
      await delay(100); // 模拟延迟
    }
    console.log('所有狼人已投票。');
  } else {
    console.log('没有狼人，跳过狼人行动。');
  }

  // 6. 再次推进阶段，应该进入预言家行动
  console.log('\nStep 6: 推进到预言家行动');
  advanceResult = await gameService.advanceGamePhase(gameId);
  if (typeof advanceResult === 'string') {
    console.error('推进失败:', advanceResult);
    console.log('--- 测试失败 ---');
    return;
  }
  game = gameService.getGame(gameId)!;
  console.log('游戏阶段推进到:', game.phase);
  if (game.phase !== GamePhase.SEER_ACTION) {
    if (game.phase === GamePhase.DAY_START) {
        console.log('没有预言家，直接进入白天，符合预期。');
        if (game.lastNightKilled && game.lastNightKilled.length > 0) {
            const killedUsernames = game.lastNightKilled.map(p => p.username).join(', ');
            console.log(`昨晚 ${killedUsernames} 被淘汰了。`);
        } else {
            console.log('昨晚是平安夜。');
        }
    } else if (game.phase === GamePhase.GAME_OVER) {
        console.log(`游戏直接结束，胜利者: ${game.winner}，符合预期。`);
    } else {
        console.error(`测试失败！期望阶段是'${GamePhase.SEER_ACTION}'或'${GamePhase.DAY_START}'，但实际是'${game.phase}'`);
        return;
    }
  } else {
    console.log('成功进入预言家行动阶段！');
  }

  // 7. 预言家行动
  console.log('\nStep 7: 预言家行动');
  const seer = game.players.find(p => p.role === Role.SEER);
  if (seer) {
    const seerTarget = game.players.find(p => p.id !== seer.id)!;
    console.log(`  预言家 ${seer.username} 准备查验 ${seerTarget.username}`);
    const seerResult = await gameService.seerAction(gameId, seer.id, seerTarget.id);
    if (typeof seerResult === 'string') {
        console.error('预言家行动失败:', seerResult);
        console.log('--- 测试失败 ---');
        return;
    }
    console.log('预言家行动成功！');
    console.log('  - 公共消息:', seerResult.message);
    console.log('  - 私聊消息:', seerResult.privateMessageForSeer);
    game = gameService.getGame(gameId)!;
    console.log('行动后游戏阶段:', game.phase);
  } else {
    console.log('没有预言家，跳过此步骤。');
  }

  console.log('\n--- 测试流程结束 ---');
}

runTest().catch(console.error);
