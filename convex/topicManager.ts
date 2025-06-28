import { v } from 'convex/values';
import {
  internalMutation,
  internalAction,
  ActionCtx,
  MutationCtx,
  internalQuery, // Added import
  QueryCtx       // Added import
} from './_generated/server';
import { api, internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { chatCompletion } from './util/llm'; // For LLM calls

// Mutation to update the current topic of a world
export const updateWorldTopicInternal = internalMutation({
  args: {
    worldId: v.id('worlds'),
    topicText: v.string(),
  },
  handler: async (ctx: MutationCtx, args: { worldId: Id<'worlds'>; topicText: string }) => {
    await ctx.db.patch(args.worldId, {
      currentTopic: {
        text: args.topicText,
        setAt: Date.now(),
      },
    });
    console.log(`Topic updated for world ${args.worldId}: "${args.topicText}"`);
  },
});

// Action to generate a new topic, potentially based on the old one
export const generateNewTopicInternal = internalAction({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx: ActionCtx, args: { worldId: Id<'worlds'> }) => {
    // 1. Get current world data, especially the current topic
    // Assuming a query like `api.worlds.getWorld` exists or will be created.
    // If `getWorld` is an internalQuery, it would be `internal.worlds.get`.
    // For now, let's assume `api.worlds.get` is a public query that can fetch the world doc.
    // If not, we'll need to create one, e.g., `internal.worlds.getWorldQuery`.
    // Correcting to use the query defined in convex/aiTown/world.ts
    const world = await ctx.runQuery(api.aiTown.world.get, { id: args.worldId });

    if (!world) {
      console.error(`generateNewTopicInternal: World ${args.worldId} not found.`);
      return; // Or throw error
    }

    const oldTopicText = world.currentTopic?.text;

    // 2. Construct prompt for LLM
    let मानव = "请为一个小镇的居民们生成一个新的、有趣的、通用的聊天话题。"; // Prompt in Chinese for a general topic
    if (oldTopicText) {
      मानव = `先前大家讨论的话题是：“${oldTopicText}”。请基于此生成一个相关联的、或者可以作为其自然延续的新聊天话题。确保新话题与旧话题有关联性。`;
    }
    मानव += "\n新话题请直接给出文本，简洁明了，适合多人参与讨论。";

    // 3. Call LLM to generate new topic
    let newTopicFromLLM = "关于天气怎么样？"; // Default fallback topic
    try {
      const llmResponse = await chatCompletion({
        messages: [
          { role: 'system', content: "你是一个创意话题生成器，帮助虚拟小镇的居民找到有趣的聊天内容。请用中文回答。" },
          { role: 'user', content: मानव },
        ],
        max_tokens: 100, // Adjust as needed for topic length
      });
      if (llmResponse.content) {
        newTopicFromLLM = llmResponse.content.trim();
      }
    } catch (error) {
      console.error(`Error generating new topic from LLM for world ${args.worldId}:`, error);
      // Keep the default fallback topic or implement more sophisticated error handling
    }

    // 4. Call mutation to update the world's topic
    await ctx.runMutation(internal.topicManager.updateWorldTopicInternal, {
      worldId: args.worldId,
      topicText: newTopicFromLLM,
    });

    console.log(`New topic generated for world ${args.worldId}: "${newTopicFromLLM}"`);
  },
});

// Action to be called by the cron job to trigger topic generation for all active worlds
export const triggerTopicGenerationForAllWorldsInternal = internalAction({
  args: {}, // No arguments needed from the cron scheduler itself
  handler: async (ctx: ActionCtx) => {
    // 1. Get all active worldIds
    // We need a query to get world statuses that are 'running'.
    // Let's assume a query `api.worldStatus.getActiveWorlds` or similar.
    // For now, using a placeholder. This query needs to be created or confirmed.
    // Path might be api.aiTown.worldStatus.getActive (if worldStatus is in aiTown folder)
    // or api.worldStatus.getActive (if worldStatus is in a top-level worlds.ts or status.ts)
    // From schema, worldStatus is in aiTown/schema.ts, so path would be like api.aiTown.worldStatus.getRunningWorlds

    // Corrected: Directly query worldStatus table
    const activeWorldStatuses = await ctx.runQuery(internal.topicManager.getActiveWorldStatusesQuery);

    if (!activeWorldStatuses || activeWorldStatuses.length === 0) {
      console.log("No active worlds found to generate topics for.");
      return;
    }

    // 2. For each active world, schedule the generateNewTopicInternal action
    for (const status of activeWorldStatuses) {
      try {
        // Using runAction as generateNewTopicInternal is an action.
        // No need for scheduler.runAfter(0, ...) if the cron itself is the scheduler.
        // The cron calls this action, and this action directly calls the other action for each world.
        await ctx.runAction(internal.topicManager.generateNewTopicInternal, { worldId: status.worldId });
        console.log(`Scheduled topic generation for active world ${status.worldId}`);
      } catch (error) {
        console.error(`Error scheduling topic generation for world ${status.worldId}:`, error);
        // Continue to next world even if one fails
      }
    }
  },
});

// Internal query to get IDs of all active worlds
export const getActiveWorldStatusesQuery = internalQuery({
  args: {},
  handler: async (ctx: QueryCtx) => {
    return await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('status'), 'running'))
      .collect();
  },
});
