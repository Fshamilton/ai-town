import { data as f1SpritesheetData } from './spritesheets/f1';
import { data as f2SpritesheetData } from './spritesheets/f2';
import { data as f3SpritesheetData } from './spritesheets/f3';
import { data as f4SpritesheetData } from './spritesheets/f4';
import { data as f5SpritesheetData } from './spritesheets/f5';
import { data as f6SpritesheetData } from './spritesheets/f6';
import { data as f7SpritesheetData } from './spritesheets/f7';
import { data as f8SpritesheetData } from './spritesheets/f8';
// Import p* spritesheet data as well, assuming they exist or will be created
// For now, let's assume they map to f* or we'll need to create them.
// To keep it simple, I'll map p* to f* for now. If new p* sprites are needed,
// their specific imports and data would be required.
import { data as p1SpritesheetData } from './spritesheets/f1'; // Placeholder, map to f1
import { data as p2SpritesheetData } from './spritesheets/f2'; // Placeholder, map to f2
import { data as p3SpritesheetData } from './spritesheets/f3'; // Placeholder, map to f3
import { data as p4SpritesheetData } from './spritesheets/f4'; // Placeholder, map to f4
import { data as p5SpritesheetData } from './spritesheets/f5'; // Placeholder, map to f5
import { data as p6SpritesheetData } from './spritesheets/f6'; // Placeholder, map to f6
import { data as p7SpritesheetData } from './spritesheets/f7'; // Placeholder, map to f7
import { data as p8SpritesheetData } from './spritesheets/f8'; // Placeholder, map to f8


import mbtiPersonalities from './mbti_personalities.json';

export interface CharacterDescription {
  name: string;
  character: string; // Sprite reference like 'f1', 'p2'
  identity: string; // This will be identity_zh
  plan: string;     // This will be plan_zh
  llm_config?: {    // Optional LLM config per character
    provider: string;
    chatModel: string;
    embeddingModel: string;
    apiKey?: string;
    url?: string;
  };
}

export const Descriptions: CharacterDescription[] = mbtiPersonalities.map((p) => ({
  name: p.name,
  character: p.character_sprite,
  identity: p.identity_zh,
  plan: p.plan_zh,
  llm_config: p.llm_config as CharacterDescription['llm_config'], // Added type assertion
}));

// Helper to map character sprite names to their data
const allSpritesheetData: Record<string, any> = {
  f1: f1SpritesheetData,
  f2: f2SpritesheetData,
  f3: f3SpritesheetData,
  f4: f4SpritesheetData,
  f5: f5SpritesheetData,
  f6: f6SpritesheetData,
  f7: f7SpritesheetData,
  f8: f8SpritesheetData,
  p1: p1SpritesheetData,
  p2: p2SpritesheetData,
  p3: p3SpritesheetData,
  p4: p4SpritesheetData,
  p5: p5SpritesheetData,
  p6: p6SpritesheetData,
  p7: p7SpritesheetData,
  p8: p8SpritesheetData,
};

export const characters = mbtiPersonalities.map((p) => {
  const characterData = allSpritesheetData[p.character_sprite];
  if (!characterData) {
    console.warn(`Spritesheet data for ${p.character_sprite} not found. Defaulting to f1.`);
    // Fallback to a default sprite if a specific one isn't found, or handle error appropriately.
    // This assumes f1SpritesheetData is always available.
    return {
      name: p.character_sprite,
      textureUrl: '/ai-town/assets/32x32folk.png', // Default texture
      spritesheetData: f1SpritesheetData, // Default/fallback spritesheet
      speed: 0.1,
    };
  }
  return {
    name: p.character_sprite, // This is the sprite name like 'f1', 'p2'
    textureUrl: '/ai-town/assets/32x32folk.png', // Assuming all use the same texture sheet
    spritesheetData: characterData,
    speed: 0.1, // Default speed, can be configured in JSON if needed
  };
});

// Ensure all unique character sprites mentioned in mbti_personalities.json
// are defined in the characters array. The map above should handle this.
// We might need to add more sprites if p1-p8 are distinct from f1-f8.
// For now, the placeholder mapping in allSpritesheetData will reuse f* sprites for p*.

// Original characters array (now generated dynamically):
// export const characters = [
//   {
//     name: 'f1',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f1SpritesheetData,
//     speed: 0.1,
//   },
//   {
//     name: 'f2',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f2SpritesheetData,
//     speed: 0.1,
//   },
//   {
//     name: 'f3',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f3SpritesheetData,
//     speed: 0.1,
//   },
//   {
//     name: 'f4',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f4SpritesheetData,
//     speed: 0.1,
//   },
//   {
//     name: 'f5',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f5SpritesheetData,
//     speed: 0.1,
//   },
//   {
//     name: 'f6',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f6SpritesheetData,
//     speed: 0.1,
//   },
//   {
//     name: 'f7',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f7SpritesheetData,
//     speed: 0.1,
//   },
//   {
//     name: 'f8',
//     textureUrl: '/ai-town/assets/32x32folk.png',
//     spritesheetData: f8SpritesheetData,
//     speed: 0.1,
//   },
// ];

// Characters move at 0.75 tiles per second.
export const movementSpeed = 0.75;
