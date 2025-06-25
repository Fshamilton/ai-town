import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/llm';
import * as memory from './memory';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId, conversationId, playerId } from '../aiTown/ids';
import { NUM_MEMORIES_TO_SEARCH } from '../constants';

const selfInternal = internal.agent.conversation;

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, agent, otherAgent, lastConversation, currentGlobalTopic } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const embedding = await embeddingsCache.fetch(
    ctx,
    `${player.name} is talking to ${otherPlayer.name}`,
  );

  const memories = await memory.searchMemories(
    ctx,
    player.id as GameId<'players'>,
    embedding,
    Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
  );

  const memoryWithOtherPlayer = memories.find(
    (m) => m.data.type === 'conversation' && m.data.playerIds.includes(otherPlayerId),
  );
  // System prompt in Chinese
  const prompt = [
    `你是 ${player.name}，你刚开始与 ${otherPlayer.name} 对话。`,
    `请始终用中文回答。`,
  ];
  if (currentGlobalTopic) {
    prompt.push(`当前世界的主要讨论话题是：“${currentGlobalTopic}”。请尝试围绕此话题展开或巧妙地将对话引导到这个主题上。`);
  }
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (memoryWithOtherPlayer) {
    prompt.push(
      `请确保在问候语中包含先前对话的一些细节或问题。`,
    );
  }
  // The user message will be the character name, then the AI will generate the words.
  const lastPrompt = `${player.name} 对 ${otherPlayer.name} 说:`;
  prompt.push(lastPrompt);

  const { content } = await chatCompletion({
    messages: [
      {
        role: 'system',
        content: prompt.join('\n'),
      },
    ],
    max_tokens: 300, // Max tokens for the response
    stop: stopWords(otherPlayer.name, player.name),
  });
  return trimContentPrefx(content, lastPrompt);
}

function trimContentPrefx(content: string, prompt: string) {
  // The LLM often includes the prompt in the response, so we remove it.
  if (content.startsWith(prompt)) {
    return content.slice(prompt.length).trim();
  }
  return content;
}

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, conversation, agent, otherAgent, currentGlobalTopic } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const now = new Date();
  const started = new Date(conversation.created);

  // Fetch memories related to the conversation or the other player
  const embedding = await embeddingsCache.fetch(
    ctx,
    `与 ${otherPlayer.name} 的对话`, // Embedding prompt in Chinese
  );
  const memories = await memory.searchMemories(ctx, player.id as GameId<'players'>, embedding, 3);

  // System prompt in Chinese
  const prompt = [
    `你是 ${player.name}，你正在与 ${otherPlayer.name} 对话中。`,
    `请始终用中文回答。`,
    `对话开始于 ${started.toLocaleString('zh-CN')}. 当前时间是 ${now.toLocaleString('zh-CN')}.`,
  ];
  if (currentGlobalTopic) {
    prompt.push(`当前世界的主要讨论话题是：“${currentGlobalTopic}”。如果合适，请围绕此话题继续对话，或者在回应中提及它。`);
  }
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...relatedMemoriesPrompt(memories));
  prompt.push(
    `以下是你和 ${otherPlayer.name} 当前的聊天记录。`,
    `不要再次打招呼。不要过于频繁地使用“嘿”这个词。你的回应应该简洁，并在100个汉字以内。`,
  );

  const llmMessages: LLMMessage[] = [
    {
      role: 'system',
      content: prompt.join('\n'),
    },
    ...(await previousMessages( // previousMessages will format messages in Chinese context
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  const lastPrompt = `${player.name} 对 ${otherPlayer.name} 说:`;
  llmMessages.push({ role: 'user', content: lastPrompt });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 200, // Max tokens for the response
    stop: stopWords(otherPlayer.name, player.name),
  });
  return trimContentPrefx(content, lastPrompt);
}

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, conversation, agent, otherAgent, currentGlobalTopic } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );

  // System prompt in Chinese
  const prompt = [
    `你是 ${player.name}，你正在与 ${otherPlayer.name} 对话中。`,
    `请始终用中文回答。`,
    `你已经决定离开对话，并希望礼貌地告诉他们你要走了。`,
  ];
  // Global topic is less relevant when leaving, but could be included if desired.
  // if (currentGlobalTopic) {
  //   prompt.push(`(当前世界话题：“${currentGlobalTopic}”)`);
  // }
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(
    `以下是你和 ${otherPlayer.name} 当前的聊天记录。`,
    `你希望如何告诉他们你要离开？你的回应应该简洁，并在50个汉字以内。`,
  );

  const llmMessages: LLMMessage[] = [
    {
      role: 'system',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>, // conversation object is available here
    )),
  ];
  const lastPrompt = `${player.name} 对 ${otherPlayer.name} 说:`;
  llmMessages.push({ role: 'user', content: lastPrompt });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 100, // Max tokens for a short leaving message
    stop: stopWords(otherPlayer.name, player.name),
  });
  return trimContentPrefx(content, lastPrompt);
}

function agentPrompts(
  otherPlayer: { name: string },
  agent: { identity: string; plan: string } | null, // identity and plan are now in Chinese
  otherAgent: { identity: string; plan: string } | null,
): string[] {
  const prompt = [];
  if (agent) {
    prompt.push(`关于你 (${agent.name || '你'}): ${agent.identity}`); // Added agent.name for clarity if available
    prompt.push(`你在对话中的目标: ${agent.plan}`);
  }
  if (otherAgent) {
    // Assuming otherAgent.name is part of the otherAgent object passed in, or use otherPlayer.name
    prompt.push(`关于 ${otherPlayer.name}: ${otherAgent.identity}`);
  }
  return prompt;
}

function previousConversationPrompt(
  otherPlayer: { name: string },
  conversation: { created: number } | null,
): string[] {
  const prompt = [];
  if (conversation) {
    const prev = new Date(conversation.created);
    const now = new Date();
    // Formatting date and time in a way that's more natural for Chinese.
    prompt.push(
      `你上次和 ${otherPlayer.name} 聊天是在 ${prev.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}。现在是 ${now.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}。`,
    );
  }
  return prompt;
}

function relatedMemoriesPrompt(memories: memory.Memory[]): string[] {
  const prompt = [];
  if (memories.length > 0) {
    prompt.push(`以下是一些相关的记忆，按相关性降序排列:`);
    for (const memory of memories) {
      // Assuming memory.description is also in Chinese or language-neutral enough.
      // If memories are in English, this might need translation or a wrapper prompt.
      prompt.push(' - ' + memory.description);
    }
  }
  return prompt;
}

// Ensure previous messages are formatted in a way the LLM expects for Chinese dialogue
async function previousMessages(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: GameId<'conversations'>,
) {
  const llmMessages: LLMMessage[] = [];
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  for (const message of prevMessages) {
    const author = message.author === player.id ? player : otherPlayer;
    const recipient = message.author === player.id ? otherPlayer : player; // Not directly used in this format
    llmMessages.push({
      role: 'user', // Representing past turns in the conversation
      // Format: "Speaker: Message"
      content: `${author.name} 说: ${message.text}`,
    });
  }
  return llmMessages;
}

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args) => {
    // Fetch the world document using the existing query (or a new one if more specific fields are needed)
    // The existing `world` variable is from `ctx.db.get(args.worldId)` which is fine if it includes `currentTopic`.
    // Let's use the specific query we created for clarity and to ensure it's loaded.
    const world = await ctx.runQuery(api.aiTown.world.get, { id: args.worldId });
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    // currentTopic will be world.currentTopic?.text or undefined
    const currentGlobalTopic = world.currentTopic?.text;

    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`Player ${args.otherPlayerId} not found`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${args.otherPlayerId} not found`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
      // This should not happen based on the current setup where agents are created with players.
      throw new Error(`Agent for player ${args.playerId} not found`);
    }
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
      .first();
    if (!agentDescription) {
      throw new Error(`Agent description for ${agent.id} not found`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    let otherAgentDescription;
    if (otherAgent) {
      otherAgentDescription = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', otherAgent.id))
        .first();
      if (!otherAgentDescription) {
        throw new Error(`Agent description for ${otherAgent.id} not found`);
      }
    }
    const lastTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('edge', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('player2', args.otherPlayerId),
      )
      // Order by conversation end time descending.
      .order('desc')
      .first();

    let lastConversation = null;
    if (lastTogether) {
      lastConversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('id', lastTogether.conversationId),
        )
        .first();
      if (!lastConversation) {
        // This could happen if an archived conversation was deleted but `participatedTogether` entry remained.
        // Consider if this should be a softer error or handled. For now, matches existing logic.
        throw new Error(`Archived conversation ${lastTogether.conversationId} not found`);
      }
    }
    return {
      player: { name: playerDescription.name, ...player },
      otherPlayer: { name: otherPlayerDescription.name, ...otherPlayer },
      conversation,
      // agentDescription contains identity and plan (which are now Chinese from mbti_personalities.json via data/characters.ts)
      agent: { name: playerDescription.name, identity: agentDescription.identity, plan: agentDescription.plan, ...agent },
      otherAgent: otherAgent && otherAgentDescription && {
        name: otherPlayerDescription.name,
        identity: otherAgentDescription.identity,
        plan: otherAgentDescription.plan,
        ...otherAgent,
      },
      lastConversation,
      currentGlobalTopic: currentGlobalTopic ?? null, // Add currentGlobalTopic to the return object
    };
  },
});

function stopWords(otherPlayerName: string, playerName: string) {
  // These are the words we ask the LLM to stop on.
  // For Chinese, this might be different, but the current format is "Speaker to Speaker:"
  // We can adjust if needed, e.g., "某某对某某说："
  // The LLM provider specific stop words (like <|eot_id|>) are handled in llm.ts
  const variants = [
    `${otherPlayerName} to ${playerName}`, // English format, in case names are still English-like
    `${otherPlayerName} 对 ${playerName} 说`, // Chinese format
    `${playerName} 对 ${otherPlayerName} 说`,
    // Add more variants if the LLM tends to output other patterns before stopping.
    // It's also important that the `lastPrompt` in the calling functions matches one of these.
  ];
  // The flatMap creates variations like "Name to Name:" and "name to name:"
  return variants.flatMap((stop) => [stop + ':', stop.toLowerCase() + ':']);
}
