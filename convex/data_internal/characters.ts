// This file is intended for backend use within the convex/ directory.
// It loads character definitions from the mbti_personalities.json file
// which is also located within convex/data_internal/.

import mbtiPersonalities from './mbti_personalities.json';

// Defines the structure for character descriptions that the backend logic will use.
// This is similar to the original CharacterDescription but might omit frontend-specific fields
// like full spritesheet data if not needed by the backend directly.
export interface CharacterDescription {
  name: string; // MBTI type, e.g., "INTP"
  character_sprite: string; // Sprite key, e.g., "f1", "p2"
  identity: string; // This will be the Chinese identity (identity_zh from JSON)
  plan: string;     // This will be the Chinese plan (plan_zh from JSON)
  llm_config?: {    // Optional LLM config per character
    provider: string;
    chatModel: string;
    embeddingModel: string;
    apiKey?: string;
    url?: string;
  };
}

// Transform the imported JSON data into the Descriptions array format
// that the rest of the backend (e.g., scenarios.ts, init.ts) expects.
export const Descriptions: CharacterDescription[] = mbtiPersonalities.map((p) => {
  // Type assertion for llm_config as its structure is known from the JSON
  const llmConfigAsserted = p.llm_config as CharacterDescription['llm_config'];

  return {
    name: p.name,
    character_sprite: p.character_sprite, // Keep the sprite key
    identity: p.identity_zh, // Map identity_zh to identity
    plan: p.plan_zh,         // Map plan_zh to plan
    llm_config: llmConfigAsserted,
  };
});

// Note: The original `data/characters.ts` also exported a `characters` array
// which included detailed spritesheet data (imported from data/spritesheets/*).
// That level of detail (actual spritesheet frame data) is typically a frontend concern.
// The backend, for agent creation, primarily needs the definition (name, identity, plan)
// and perhaps a key to which sprite to use (character_sprite).
// The actual loading and rendering of sprites from 'public/assets/spritesheets/'
// based on these keys would be handled by the frontend.
// Therefore, this backend version `convex/data_internal/characters.ts` does not
// need to, and should not, try to import from `../../data/spritesheets/`.
// It only provides the `Descriptions` array.
// If any backend logic *does* need the full spritesheet data (unlikely), that part of the
// original `data/characters.ts` would need a more complex refactoring or alternative approach.
// For now, this simplified `Descriptions` export is sufficient for agent definition.
