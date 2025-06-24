import { v } from 'convex/values';
import { internal, api } from './_generated/api'; // Added api for public mutation/action
import { ActionCtx, MutationCtx, internalAction, internalMutation, internalQuery, action } from './_generated/server'; // Added action
import { Descriptions, CharacterDescription } from '../../data/characters'; // Corrected path
import { Id } from './_generated/dataModel';
import { ENGINE_ACTION_DURATION } from '../constants'; // Import for scheduling runStep

// This internal action will handle the core logic of creating a world and populating it with characters.
export const createWorldFromScenarioInternal = internalAction({
  args: {
    characterNames: v.array(v.string()),
    worldName: v.string(),
  },
  handler: async (ctx: ActionCtx, args: { characterNames: string[]; worldName: string }) => {

    const newWorldId = await ctx.runAction(internal.scenarios.createNamedWorldHelper, {
      worldName: args.worldName,
    });

    for (const characterName of args.characterNames) {
      const descriptionIndex = Descriptions.findIndex(desc => desc.name === characterName);

      if (descriptionIndex === -1) {
        console.warn(`Scenario: Character description for "${characterName}" not found in Descriptions. Skipping.`);
        continue;
      }

      // Changed to call the mutation directly as it's now defined as an internalMutation
      await ctx.runMutation(internal.scenarios.internalInsertAgentInputMutation, {
        worldId: newWorldId,
        descriptionIndex: descriptionIndex,
      });
    }

    console.log(`New world created from scenario with ID: ${newWorldId} and characters: ${args.characterNames.join(', ')}`);
    return newWorldId;
  },
});

// Helper internal action to create the world and associated entities
export const createNamedWorldHelper = internalAction({
  args: { worldName: v.string() },
  handler: async (ctx: ActionCtx, args: { worldName: string }) => {

    // Assuming internal.aiTown.main.createEngine is an internalMutation that wraps the logic.
    // If createEngine is in main.ts and not an internal mutation, this needs adjustment.
    // For now, this assumes `createEngine` is refactored or available as an internal mutation.
    const engineId = await ctx.runMutation(internal.aiTown.main.createEngine);

    const worldId = await ctx.runMutation(internal.scenarios.insertWorldEntryMutation);

    await ctx.runMutation(internal.scenarios.insertWorldStatusEntryMutation, {
      engineId,
      worldId,
      isDefault: false,
      status: 'running',
    });

    await ctx.runMutation(internal.scenarios.insertMapDataMutation, { worldId });

    const engine = await ctx.runQuery(internal.scenarios.getEngineDataQuery, { engineId });
    if (!engine) {
        console.error(`Failed to retrieve new engine data for engineId: ${engineId}`);
        throw new Error("Failed to retrieve new engine data after creation.");
    }

    await ctx.scheduler.runAfter(0, internal.aiTown.main.runStep, {
      worldId,
      generationNumber: engine.generationNumber,
      maxDuration: ENGINE_ACTION_DURATION,
    });

    console.log(`Helper: Created new world ${worldId} with engine ${engineId} for scenario: ${args.worldName}`);
    return worldId;
  },
});

// --- Supporting internal mutations/queries called by createNamedWorldHelper ---
export const insertWorldEntryMutation = internalMutation({
    handler: async (ctx: MutationCtx) => {
        return await ctx.db.insert('worlds', {
            nextId: 0,
            agents: [],
            conversations: [],
            players: [],
        });
    }
});

export const insertWorldStatusEntryMutation = internalMutation({
    args: {
        engineId: v.id('engines'),
        worldId: v.id('worlds'),
        isDefault: v.boolean(),
        status: v.string(),
    },
    handler: async (ctx: MutationCtx, args) => {
        const now = Date.now();
        await ctx.db.insert('worldStatus', {
            engineId: args.engineId,
            isDefault: args.isDefault,
            lastViewed: now,
            status: args.status,
            worldId: args.worldId,
        });
    }
});

export const insertMapDataMutation = internalMutation({
    args: { worldId: v.id('worlds')},
    handler: async (ctx: MutationCtx, args) => {
        const map = await import('../../data/gentle'); // Path corrected, assuming it's a module now
        await ctx.db.insert('maps', {
            worldId: args.worldId,
            width: map.mapwidth,
            height: map.mapheight,
            tileSetUrl: map.tilesetpath,
            tileSetDimX: map.tilesetpxw,
            tileSetDimY: map.tilesetpxh,
            tileDim: map.tiledim,
            bgTiles: map.bgtiles,
            objectTiles: map.objmap,
            animatedSprites: map.animatedsprites,
        });
    }
});

export const getEngineDataQuery = internalQuery({
    args: { engineId: v.id('engines') },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.engineId);
    }
});

export const internalInsertAgentInputMutation = internalMutation({
    args: {
        worldId: v.id('worlds'),
        descriptionIndex: v.number(),
    },
    handler: async (ctx: MutationCtx, args) => {
        const worldStatus = await ctx.db
            .query('worldStatus')
            .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
            .unique();

        if (!worldStatus) {
            throw new Error(`World status not found for worldId: ${args.worldId}. Agent cannot be added.`);
        }
        const engineId = worldStatus.engineId;

        const now = Date.now();
        const prevInput = await ctx.db
            .query('inputs')
            .withIndex('byInputNumber', (q) => q.eq('engineId', engineId))
            .order('desc')
            .first();
        const number = prevInput ? prevInput.number + 1 : 0;

        const inputId = await ctx.db.insert('inputs', {
            engineId,
            number,
            name: 'createAgent' as any,
            args: { descriptionIndex: args.descriptionIndex },
            received: now,
        });
        return inputId;
    }
});

// Public action callable by clients to create a world based on a scenario.
export const createWorldFromScenario = action({
  args: {
    characterNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx: ActionCtx, args: { characterNames?: string[] }) => {
    let selectedCharacterNames: string[];

    if (args.characterNames && args.characterNames.length > 0) {
      const allValidNames = Descriptions.map(d => d.name);
      for (const name of args.characterNames) {
        if (!allValidNames.includes(name)) {
          throw new Error(`Invalid character name provided: "${name}". Valid names are: ${allValidNames.join(', ')}`);
        }
      }
      selectedCharacterNames = [...new Set(args.characterNames)];
      if (selectedCharacterNames.length === 0) { // Handle case where input array was empty after Set
        console.warn("Received empty or all-duplicate characterNames list; defaulting.");
        selectedCharacterNames = ["INTP", "ENFP", "ISFP", "INTJ"];
      }
    } else {
      // Default characters
      selectedCharacterNames = ["INTP", "ENFP", "ISFP", "INTJ"];
    }

    // Ensure default characters are valid (this is a safeguard)
    const allValidNames = Descriptions.map(d => d.name);
    for (const name of selectedCharacterNames) {
      if (!allValidNames.includes(name)) {
        console.error(`Configuration error: Character name "${name}" (default or provided) is invalid! Check data/characters.ts and mbti_personalities.json.`);
        throw new Error(`Internal configuration error: Character name "${name}" is invalid.`);
      }
    }

    const now = new Date();
    const worldName = `mbti_town_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

    return await ctx.runAction(internal.scenarios.createWorldFromScenarioInternal, {
      characterNames: selectedCharacterNames,
      worldName: worldName,
    });
  },
});
