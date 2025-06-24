import { v } from 'convex/values';
import { internal, api } from './_generated/api'; // Added api
import { DatabaseReader, MutationCtx, mutation } from './_generated/server';
import { Descriptions } from './data_internal/characters';
import * as mapData from './data_internal/mapData';
// insertInput is not directly used by init anymore if we call the scenario action
// import { insertInput } from './aiTown/insertInput';
import { Id } from './_generated/dataModel';
// createEngine is called within getOrCreateDefaultWorld, ensure it's correctly an internalMutation or callable
import { createEngine } from './aiTown/main';
import { ENGINE_ACTION_DURATION } from './constants';
import { detectMismatchedLLMProvider } from './util/llm';

const init = mutation({
  args: {
    mode: v.optional(v.union(v.literal('default'), v.literal('randomN'))),
    numRandomCharacters: v.optional(v.number()),
    // Kept for backward compatibility or direct specification, though `mode` is preferred.
    // If `numAgents` is provided and `mode` is not 'randomN', it could imply creating all available agents up to `numAgents`.
    // For now, focusing on `mode` and `numRandomCharacters`.
    numAgents: v.optional(v.number()),
  },
  handler: async (ctx, args: {
    mode?: 'default' | 'randomN',
    numRandomCharacters?: number,
    numAgents?: number
  }) => {
    detectMismatchedLLMProvider();
    const { worldStatus, engine } = await getOrCreateDefaultWorld(ctx);
    if (worldStatus.status !== 'running') {
      console.warn(
        `Engine ${engine._id} is not active! Run "npx convex run testing:resume" to restart it.`,
      );
      return;
    }
    const shouldCreate = await shouldCreateAgents(
      ctx.db,
      worldStatus.worldId,
      worldStatus.engineId,
    );

    if (shouldCreate) {
      let scenarioArgs: any = {};
      if (args.mode === 'randomN' && args.numRandomCharacters !== undefined && args.numRandomCharacters > 0) {
        scenarioArgs = { numRandomCharacters: args.numRandomCharacters };
        console.log(`init: Creating world with ${args.numRandomCharacters} random characters.`);
      } else if (args.mode === 'default') {
        scenarioArgs = { characterNames: ["INTP", "ENFP", "ISFP", "INTJ"] }; // Explicitly pass default names
        console.log(`init: Creating world with default characters (INTP, ENFP, ISFP, INTJ).`);
      } else if (args.numAgents !== undefined) {
        // Legacy or direct numAgents handling: create specific number of agents from the start of Descriptions list.
        // This part can be refined or removed if `mode` covers all cases.
        // For now, let's make it call the scenario with a slice of Descriptions.
        const characterNames = Descriptions.slice(0, args.numAgents).map(d => d.name);
        scenarioArgs = { characterNames };
        console.log(`init: Creating world with first ${args.numAgents} characters from Descriptions list.`);
      }
      else { // Default behavior if no mode or relevant args specified
        scenarioArgs = { characterNames: ["INTP", "ENFP", "ISFP", "INTJ"] }; // Default to specific 4
        console.log(`init: Defaulting to create world with specific characters (INTP, ENFP, ISFP, INTJ).`);
      }

      // Ensure that if characterNames is empty (e.g. numAgents was 0), we pass undefined or handle it.
      // The scenario action handles empty characterNames by using its own defaults.
      if (scenarioArgs.characterNames && scenarioArgs.characterNames.length === 0 && !scenarioArgs.numRandomCharacters) {
         console.log("init: No specific characters to create based on numAgents, scenario will use its defaults.");
         scenarioArgs = {}; // Let scenario action use its internal default
      }


      await ctx.runAction(api.scenarios.createWorldFromScenario, scenarioArgs);
    } else {
      console.log("init: No new agents needed based on shouldCreateAgents check.");
    }
  },
});
export default init;

async function getOrCreateDefaultWorld(ctx: MutationCtx) {
  const now = Date.now();

  let worldStatus = await ctx.db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .unique();
  if (worldStatus) {
    const engine = (await ctx.db.get(worldStatus.engineId))!;
    return { worldStatus, engine };
  }

  // createEngine is now an internalMutation, called via internal.aiTown.main.createEngine
  const engineId = await ctx.runMutation(internal.aiTown.main.createEngine, {});
  const engine = (await ctx.db.get(engineId))!;
  if (!engine) {
    throw new Error(`Failed to create or get engine ${engineId}`);
  }
  const worldId = await ctx.db.insert('worlds', {
    nextId: 0, // This field's usage should be reviewed; typically IDs are managed by Convex.
    agents: [],
    conversations: [],
    players: [],
  });
  const worldStatusId = await ctx.db.insert('worldStatus', {
    engineId: engineId,
    isDefault: true,
    lastViewed: now,
    status: 'running',
    worldId: worldId,
  });
  worldStatus = (await ctx.db.get(worldStatusId))!;
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
  return { worldStatus, engine };
}

async function shouldCreateAgents(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
  engineId: Id<'engines'>,
) {
  const world = await db.get(worldId);
  if (!world) {
    throw new Error(`Invalid world ID: ${worldId}`);
  }
  if (world.agents.length > 0) {
    return false;
  }
  const unactionedJoinInputs = await db
    .query('inputs')
    .withIndex('byInputNumber', (q) => q.eq('engineId', engineId))
    .order('asc')
    .filter((q) => q.eq(q.field('name'), 'createAgent'))
    .filter((q) => q.eq(q.field('returnValue'), undefined))
    .collect();
  if (unactionedJoinInputs.length > 0) {
    return false;
  }
  return true;
}
