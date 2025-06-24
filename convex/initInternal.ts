import { v } from 'convex/values';
import { internal } from './_generated/api';
import { DatabaseReader, MutationCtx, QueryCtx, internalMutation, internalQuery } from './_generated/server';
import { Id } from './_generated/dataModel';
import * as mapData from './data_internal/mapData';
import { ENGINE_ACTION_DURATION } from './constants';

// This mutation encapsulates the logic for setting up (creating if necessary) the default world.
// It handles all database write operations.
export const setupDefaultWorld = internalMutation({
  args: {}, // No arguments needed as it always operates on the "default" world concept
  handler: async (ctx: MutationCtx) => {
    const now = Date.now();

    let worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .unique();

    if (worldStatus) {
      const engine = await ctx.db.get(worldStatus.engineId);
      if (!engine) {
        // This case should ideally not happen if data integrity is maintained.
        // If engine is missing, we might need to create a new one or throw a more specific error.
        // For now, let's assume if worldStatus exists, engine should too, or handle as error.
        throw new Error(`Engine with ID ${worldStatus.engineId} not found for default world.`);
      }
      return {
        worldId: worldStatus.worldId,
        engineId: worldStatus.engineId,
        status: worldStatus.status, // 'running' or 'stopped'
        engineGeneration: engine.generationNumber,
        engineIsRunning: engine.running,
      };
    }

    // If no default worldStatus, create a new default world, engine, map, etc.
    // Assumes 'internal.aiTown.main.createEngine' is an internalMutation
    const engineId = await ctx.run(internal.aiTown.main.createEngine, {});
    const engine = await ctx.db.get(engineId);
    if (!engine) {
      throw new Error(`Failed to create or retrieve engine with ID ${engineId}`);
    }

    const worldId = await ctx.db.insert('worlds', {
      nextId: 0,
      agents: [],
      conversations: [],
      players: [],
    });

    const worldStatusId = await ctx.db.insert('worldStatus', {
      engineId: engineId,
      isDefault: true,
      lastViewed: now,
      status: 'running', // New default worlds start as running
      worldId: worldId,
    });

    // worldStatus = await ctx.db.get(worldStatusId); // Not strictly needed to re-fetch for return value construction
    // if (!worldStatus) throw new Error("Failed to retrieve new worldStatus");


    await ctx.db.insert('maps', {
      worldId,
      width: mapData.mapwidth,
      height: mapData.mapheight,
      tileSetUrl: mapData.tilesetpath,
      tileSetDimX: mapData.tilesetpxw,
      tileSetDimY: mapData.tilesetpxh,
      tileDim: mapData.tiledim,
      bgTiles: mapData.bgtiles,
      objectTiles: mapData.objmap,
      animatedSprites: mapData.animatedsprites,
    });

    await ctx.scheduler.runAfter(0, internal.aiTown.main.runStep, {
      worldId,
      generationNumber: engine.generationNumber,
      maxDuration: ENGINE_ACTION_DURATION,
    });

    return {
      worldId: worldId,
      engineId: engineId,
      status: 'running', // Matches what was inserted
      engineGeneration: engine.generationNumber,
      engineIsRunning: engine.running,
    };
  },
});

// This query encapsulates the logic to determine if agents should be created.
export const queryShouldCreateAgents = internalQuery({
  args: {
    worldId: v.id('worlds'),
    engineId: v.id('engines'),
  },
  handler: async (ctx: QueryCtx, args: { worldId: Id<'worlds'>, engineId: Id<'engines'> }) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      // This might happen if the worldId passed is somehow invalid or deleted.
      // Depending on desired behavior, could throw error or return true/false.
      // Returning false enseñanza safety, as a non-existent world can't have agents.
      console.error(`queryShouldCreateAgents: Invalid world ID: ${args.worldId}`);
      return false;
    }
    if (world.agents.length > 0) {
      return false; // Agents already exist
    }

    // Check for unactioned 'createAgent' inputs
    const unactionedJoinInputs = await ctx.db
      .query('inputs')
      .withIndex('byInputNumber', (q) => q.eq('engineId', args.engineId))
      .order('asc')
      .filter((q) => q.eq(q.field('name'), 'createAgent'))
      .filter((q) => q.eq(q.field('returnValue'), undefined)) // Input not yet processed
      .collect();

    if (unactionedJoinInputs.length > 0) {
      return false; // There are pending createAgent inputs
    }

    return true; // No agents and no pending createAgent inputs
  },
});
