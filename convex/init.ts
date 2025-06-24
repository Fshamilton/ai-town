import { v } from 'convex/values';
import { internal, api } from './_generated/api'; // api might be needed if calling public actions like scenarios
import { ActionCtx, action } from './_generated/server'; // Correctly import action and ActionCtx
import { Descriptions } from './data_internal/characters';
import { detectMismatchedLLMProvider } from './util/llm';
// Removed DatabaseReader, MutationCtx, mutation, mapData, Id, createEngine, ENGINE_ACTION_DURATION
// as their primary logic is now in initInternal.ts or not directly used by this action's top level.

const init = action({ // DEFINED AS ACTION
  args: {
    mode: v.optional(v.union(v.literal('default'), v.literal('randomN'))),
    numRandomCharacters: v.optional(v.number()),
    numAgents: v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args: {
    mode?: 'default' | 'randomN',
    numRandomCharacters?: number,
    numAgents?: number
  }) => {
    detectMismatchedLLMProvider();

    // Step 1: Get or create the default world status, engine, etc.
    // This calls an internalMutation that encapsulates all DB write operations.
    const worldSetupResult = await ctx.runMutation(internal.initInternal.setupDefaultWorld, {});

    if (!worldSetupResult) {
        console.error("init: Failed to setup or retrieve default world. Critical error in setupDefaultWorld mutation.");
        throw new Error("Critical error: Default world setup failed.");
    }

    const { worldId, engineId, engineIsRunning } = worldSetupResult;

    if (!engineIsRunning) {
      console.warn(
        `Engine ${engineId} for default world ${worldId} is not active. ` +
        `It might have been newly created (and runStep is scheduled) or was previously stopped. `
      );
    }

    // Step 2: Determine if agents should be created for this world using an internalQuery.
    const shouldCreate = await ctx.runQuery(internal.initInternal.queryShouldCreateAgents, {
      worldId,
      engineId,
    });

    if (shouldCreate) {
      let charactersToCreateInDefaultWorld: string[];

      if (args.mode === 'randomN' && args.numRandomCharacters !== undefined && args.numRandomCharacters > 0) {
        const allPossibleCharacterNames = Descriptions.map(d => d.name); // Descriptions is available from import
        if (args.numRandomCharacters > allPossibleCharacterNames.length) {
            throw new Error(`Cannot select ${args.numRandomCharacters} unique characters from a pool of ${allPossibleCharacterNames.length}. Max is ${allPossibleCharacterNames.length}.`);
        }
        charactersToCreateInDefaultWorld = [...allPossibleCharacterNames].sort(() => 0.5 - Math.random()).slice(0, args.numRandomCharacters);
        console.log(`init: Will create ${args.numRandomCharacters} random characters in the default world ${worldId}.`);

      } else if (args.mode === 'default') {
        charactersToCreateInDefaultWorld = ["INTP", "ENFP", "ISFP", "INTJ"];
        const allNames = Descriptions.map(d => d.name);
        charactersToCreateInDefaultWorld = charactersToCreateInDefaultWorld.filter(name => {
            if (!allNames.includes(name)) {
                console.warn(`init: Default character "${name}" not found in current Descriptions. Skipping it.`);
                return false;
            }
            return true;
        });
        console.log(`init: Will create default characters (${charactersToCreateInDefaultWorld.join(', ')}) in the default world ${worldId}.`);

      } else if (args.numAgents !== undefined && args.numAgents >= 0) {
        charactersToCreateInDefaultWorld = Descriptions.slice(0, args.numAgents).map(d => d.name);
        console.log(`init: Will create first ${args.numAgents} characters from Descriptions in the default world ${worldId}.`);

      } else {
        charactersToCreateInDefaultWorld = ["INTP", "ENFP", "ISFP", "INTJ"];
        const allNames = Descriptions.map(d => d.name);
        charactersToCreateInDefaultWorld = charactersToCreateInDefaultWorld.filter(name => {
            if (!allNames.includes(name)) {
                console.warn(`init: Default character "${name}" not found in current Descriptions. Skipping it.`);
                return false;
            }
            return true;
        });
        console.log(`init: Defaulting to create specific characters (${charactersToCreateInDefaultWorld.join(', ')}) in the default world ${worldId}.`);
      }

      if (charactersToCreateInDefaultWorld.length > 0) {
        for (const characterName of charactersToCreateInDefaultWorld) {
            const descriptionIndex = Descriptions.findIndex(desc => desc.name === characterName);
            if (descriptionIndex === -1) {
                console.warn(`init: Character description for "${characterName}" unexpectedly not found during agent queuing. Skipping.`);
                continue;
            }
            // This directly calls the mutation to add agent inputs to the *default* world.
            await ctx.runMutation(internal.scenarios.internalInsertAgentInputMutation, {
                worldId: worldId,
                descriptionIndex: descriptionIndex,
            });
        }
        console.log(`init: Queued ${charactersToCreateInDefaultWorld.length} agents for creation in default world ${worldId}.`);
      } else {
        console.log(`init: No characters specified or valid to create in the default world ${worldId}.`);
      }

    } else {
      console.log(`init: No new agents needed for default world ${worldId} based on queryShouldCreateAgents check.`);
    }
  },
});
export default init;
