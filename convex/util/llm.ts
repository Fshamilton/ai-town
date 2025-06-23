// That's right! No imports and no dependencies 🤯

const OPENAI_EMBEDDING_DIMENSION = 1536;
const TOGETHER_EMBEDDING_DIMENSION = 768;
const OLLAMA_EMBEDDING_DIMENSION = 1024; // Default for mxbai-embed-large
const QWEN_EMBEDDING_DIMENSION = 4096; // qwen2 embedding dimension is 4096

// Set the default embedding dimension to be compatible with qwen or allow override.
// We'll default to OLLAMA_EMBEDDING_DIMENSION for now, assuming mxbai-embed-large is a common default.
// If a user specifically sets up qwen3 for embeddings, they might need to adjust this or the config.

// const OPENAI_EMBEDDING_DIMENSION = 1536; // Defined below
// const TOGETHER_EMBEDDING_DIMENSION = 768; // Defined below
// Renaming for clarity and to avoid conflict with the exported constant.
const DEFAULT_OLLAMA_MXBAI_EMBED_LARGE_DIMENSION = 1024;
const DEFAULT_OLLAMA_QWEN_DIMENSION = 4096;

// This value is used in convex/agent/schema.ts for vector index dimensions.
// It MUST be a compile-time constant.
// Defaulting to the dimension of `mxbai-embed-large` as it's a common default.
// IF YOU CHANGE THE DEFAULT EMBEDDING MODEL (e.g. OLLAMA_EMBEDDING_MODEL in .env)
// TO ONE WITH A DIFFERENT DIMENSION, YOU MUST UPDATE THIS CONSTANT VALUE HERE TO MATCH,
// AND THEN RE-DEPLOY YOUR CONVEX FUNCTIONS (npx convex deploy).
export const EMBEDDING_DIMENSION: number = DEFAULT_OLLAMA_MXBAI_EMBED_LARGE_DIMENSION; // Defaulting to 1024

// These are for runtime checks within getLLMConfig primarily.
const OPENAI_EMBEDDING_DIMENSION_CONST = 1536;
const TOGETHER_EMBEDDING_DIMENSION_CONST = 768;


export function detectMismatchedLLMProvider() {
  // This function's primary role is to check for API keys if a non-Ollama provider is hinted at
  // by the presence of their specific API keys in the environment.
  // The actual dimension matching for embeddings is enforced by the schema's use of the
  // hardcoded EMBEDDING_DIMENSION and runtime checks in getLLMConfig.

  // Note: process.env access here is fine as this function is expected to be called at runtime,
  // not during schema evaluation.
  if (process.env.OPENAI_API_KEY && !process.env.LLM_PROVIDER) {
    // If OPENAI_API_KEY is set and no specific provider, it's likely OpenAI.
    // A runtime check in getLLMConfig will verify if schema EMBEDDING_DIMENSION is compatible.
    if (EMBEDDING_DIMENSION !== OPENAI_EMBEDDING_DIMENSION_CONST) {
      console.warn(
        `OpenAI API key found, but schema EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}) ` +
        `does not match OpenAI's typical embedding dimension (${OPENAI_EMBEDDING_DIMENSION_CONST}). ` +
        `Ensure your vector index dimension is compatible if using OpenAI for embeddings.`
      );
    }
  } else if (process.env.TOGETHER_API_KEY && !process.env.LLM_PROVIDER) {
    if (EMBEDDING_DIMENSION !== TOGETHER_EMBEDDING_DIMENSION_CONST) {
       console.warn(
        `Together API key found, but schema EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}) ` +
        `does not match Together.AI's typical embedding dimension (${TOGETHER_EMBEDDING_DIMENSION_CONST}). ` +
        `Ensure your vector index dimension is compatible if using Together.AI for embeddings.`
      );
    }
  } else if (process.env.LLM_PROVIDER === 'custom' && !process.env.LLM_API_URL) {
    console.warn(
      `LLM_PROVIDER is 'custom' but LLM_API_URL is not set. This might lead to issues.`,
    );
  }
  // For Ollama (default or explicit), no API key check is needed here.
  // The getLLMConfig will perform runtime checks for Ollama embedding model dimensions against EMBEDDING_DIMENSION.
}

export interface LLMConfig {
  provider: 'openai' | 'together' | 'ollama' | 'custom';
  url: string; // Should not have a trailing slash
  chatModel: string;
  embeddingModel: string;
  embeddingDimension: number; // Make this mandatory in the config, reflecting the actual model's dim.
  stopWords: string[];
  apiKey: string | undefined;
}

export function getLLMConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() || 'ollama'; // Default to ollama

  if (provider === 'openai' || process.env.OPENAI_API_KEY) {
    if (EMBEDDING_DIMENSION !== OPENAI_EMBEDDING_DIMENSION_CONST && !(process.env.LLM_PROVIDER === 'openai')) {
      // If LLM_PROVIDER is explicitly 'openai', user is asserting this choice.
      // Otherwise, if key is present but provider not set, and dimensions mismatch, throw error.
      // This is a runtime check. The schema is already fixed.
      throw new Error(
        `Runtime check: OpenAI is configured or API key found, but its embedding dimension (${OPENAI_EMBEDDING_DIMENSION_CONST}) ` +
        `does not match the schema's EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}). ` +
        `To use OpenAI embeddings, ensure the schema's EMBEDDING_DIMENSION in llm.ts is ${OPENAI_EMBEDDING_DIMENSION_CONST} and redeploy.`
      );
    }
    return {
      provider: 'openai',
      url: 'https://api.openai.com',
      chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-ada-002',
      embeddingDimension: OPENAI_EMBEDDING_DIMENSION_CONST,
      stopWords: [],
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  if (provider === 'together' || process.env.TOGETHER_API_KEY) {
    if (EMBEDDING_DIMENSION !== TOGETHER_EMBEDDING_DIMENSION_CONST && !(process.env.LLM_PROVIDER === 'together')) {
      throw new Error(
        `Runtime check: Together.AI is configured or API key found, but its embedding dimension (${TOGETHER_EMBEDDING_DIMENSION_CONST}) ` +
        `does not match the schema's EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}). ` +
        `To use Together.AI embeddings, ensure the schema's EMBEDDING_DIMENSION in llm.ts is ${TOGETHER_EMBEDDING_DIMENSION_CONST} and redeploy.`
      );
    }
    return {
      provider: 'together',
      url: 'https://api.together.xyz',
      chatModel: process.env.TOGETHER_CHAT_MODEL ?? 'meta-llama/Llama-3-8b-chat-hf',
      embeddingModel:
        process.env.TOGETHER_EMBEDDING_MODEL ?? 'togethercomputer/m2-bert-80M-8k-retrieval',
      embeddingDimension: TOGETHER_EMBEDDING_DIMENSION_CONST,
      stopWords: ['<|eot_id|>'],
      apiKey: process.env.TOGETHER_API_KEY,
    };
  }

  if (provider === 'custom' || process.env.LLM_API_URL) {
    const apiKey = process.env.LLM_API_KEY;
    const url = process.env.LLM_API_URL;
    if (!url) throw new Error('LLM_API_URL is required for custom provider.');
    const chatModel = process.env.LLM_MODEL;
    if (!chatModel) throw new Error('LLM_MODEL is required for custom provider.');
    const embeddingModelName = process.env.LLM_EMBEDDING_MODEL;
    if (!embeddingModelName) throw new Error('LLM_EMBEDDING_MODEL is required for custom provider.');
    // For custom provider, user must ensure their embedding model's dimension matches schema's EMBEDDING_DIMENSION.
    // We trust EMBEDDING_DIMENSION from schema for the config.
    return {
      provider: 'custom',
      url,
      chatModel,
      embeddingModel: embeddingModelName,
      embeddingDimension: EMBEDDING_DIMENSION, // Assumes custom model matches schema dimension
      stopWords: [],
      apiKey,
    };
  }

  // Default to Ollama
  const ollamaEmbeddingModelName = process.env.OLLAMA_EMBEDDING_MODEL ?? 'mxbai-embed-large';
  let actualOllamaModelDimension = DEFAULT_OLLAMA_MXBAI_EMBED_LARGE_DIMENSION; // Default for mxbai

  if (ollamaEmbeddingModelName.includes('qwen')) {
    actualOllamaModelDimension = DEFAULT_OLLAMA_QWEN_DIMENSION;
  } else if (ollamaEmbeddingModelName.includes('llama3')) {
    // Add other heuristics if needed, e.g. for llama3 if its dimension is known
    // actualOllamaModelDimension = LLAMA3_DIMENSION_CONSTANT;
  }
  // Add more heuristics for other ollama model names if their dimensions are known and different.

  // Critical Runtime Check: The chosen Ollama embedding model's actual dimension MUST match the schema's EMBEDDING_DIMENSION.
  if (actualOllamaModelDimension !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Ollama configuration error at runtime: The actual dimension of the selected embedding model ` +
      `'${ollamaEmbeddingModelName}' (dimension: ${actualOllamaModelDimension}) ` +
      `does not match the schema's hardcoded EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}). ` +
      `Please update OLLAMA_EMBEDDING_MODEL in your environment to one compatible with dimension ${EMBEDDING_DIMENSION}, ` +
      `or update the EMBEDDING_DIMENSION constant in convex/util/llm.ts to ${actualOllamaModelDimension} and re-deploy convex functions.`
    );
  }

  return {
    provider: 'ollama',
    url: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    chatModel: process.env.OLLAMA_MODEL ?? 'qwen3',
    embeddingModel: ollamaEmbeddingModelName,
    embeddingDimension: actualOllamaModelDimension, // This must match EMBEDDING_DIMENSION
    stopWords: ['<|eot_id|>', '<|im_end|>', '<|im_start|>'],
    apiKey: undefined,
  };
}

const AuthHeaders = (): Record<string, string> => {
  // This function is called at runtime, so getLLMConfig() is fine.
  const config = getLLMConfig();
  return config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {};
};

// Overload for non-streaming
export async function chatCompletion(
  body: Omit<CreateChatCompletionRequest, 'model'> & {
    model?: CreateChatCompletionRequest['model'];
  } & {
    stream?: false | null | undefined;
  },
): Promise<{ content: string; retries: number; ms: number }>;
// Overload for streaming
export async function chatCompletion(
  body: Omit<CreateChatCompletionRequest, 'model'> & {
    model?: CreateChatCompletionRequest['model'];
  } & {
    stream?: true;
  },
): Promise<{ content: ChatCompletionContent; retries: number; ms: number }>;
export async function chatCompletion(
  body: Omit<CreateChatCompletionRequest, 'model'> & {
    model?: CreateChatCompletionRequest['model'];
  },
) {
  const config = getLLMConfig(); // Called at runtime
  body.model = body.model ?? config.chatModel;
  const stopWords = body.stop ? (typeof body.stop === 'string' ? [body.stop] : body.stop) : [];
  if (config.stopWords) stopWords.push(...config.stopWords);
  console.log(body);
  const {
    result: content,
    retries,
    ms,
  } = await retryWithBackoff(async () => {
    const result = await fetch(config.url + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...AuthHeaders(), // Called at runtime
      },

      body: JSON.stringify(body),
    });
    if (!result.ok) {
      const error = await result.text();
      console.error({ error });
      if (result.status === 404 && config.provider === 'ollama') {
        await tryPullOllama(body.model!, error); // tryPullOllama calls getLLMConfig
      }
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Chat completion failed with code ${result.status}: ${error}`),
      };
    }
    if (body.stream) {
      return new ChatCompletionContent(result.body!, stopWords);
    } else {
      const json = (await result.json()) as CreateChatCompletionResponse;
      const content = json.choices[0].message?.content;
      if (content === undefined) {
        throw new Error('Unexpected result from OpenAI: ' + JSON.stringify(json));
      }
      console.log(content);
      return content;
    }
  });

  return {
    content,
    retries,
    ms,
  };
}

export async function tryPullOllama(model: string, error: string) {
  if (error.includes('try pulling')) {
    console.error('Embedding model not found, pulling from Ollama');
    // getLLMConfig() is called here at runtime.
    const pullResp = await fetch(getLLMConfig().url + '/api/pull', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: model }),
    });
    console.log('Pull response', await pullResp.text());
    throw { retry: true, error: `Dynamically pulled model. Original error: ${error}` };
  }
}

export async function fetchEmbeddingBatch(texts: string[]) {
  const config = getLLMConfig(); // Called at runtime
  if (config.provider === 'ollama') {
    return {
      ollama: true as const,
      embeddings: await Promise.all(
        texts.map(async (t) => (await ollamaFetchEmbedding(t)).embedding), // ollamaFetchEmbedding calls getLLMConfig
      ),
    };
  }
  const {
    result: json,
    retries,
    ms,
  } = await retryWithBackoff(async () => {
    const result = await fetch(config.url + '/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...AuthHeaders(), // Called at runtime
      },

      body: JSON.stringify({
        model: config.embeddingModel,
        input: texts.map((text) => text.replace(/\n/g, ' ')),
      }),
    });
    if (!result.ok) {
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Embedding failed with code ${result.status}: ${await result.text()}`),
      };
    }
    return (await result.json()) as CreateEmbeddingResponse;
  });
  if (json.data.length !== texts.length) {
    console.error(json);
    throw new Error('Unexpected number of embeddings');
  }
  const allembeddings = json.data;
  allembeddings.sort((a, b) => a.index - b.index);
  return {
    ollama: false as const,
    embeddings: allembeddings.map(({ embedding }) => embedding),
    usage: json.usage?.total_tokens,
    retries,
    ms,
  };
}

export async function fetchEmbedding(text: string) {
  const { embeddings, ...stats } = await fetchEmbeddingBatch([text]); // fetchEmbeddingBatch calls getLLMConfig
  return { embedding: embeddings[0], ...stats };
}

export async function fetchModeration(content: string) {
  const { result: flagged } = await retryWithBackoff(async () => {
    // getLLMConfig() is called by AuthHeaders()
    const result = await fetch(getLLMConfig().url + '/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...AuthHeaders(),
      },

      body: JSON.stringify({
        input: content,
      }),
    });
    if (!result.ok) {
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Embedding failed with code ${result.status}: ${await result.text()}`),
      };
    }
    return (await result.json()) as { results: { flagged: boolean }[] };
  });
  return flagged;
}

// Retry after this much time, based on the retry number.
const RETRY_BACKOFF = [1000, 10_000, 20_000]; // In ms
const RETRY_JITTER = 100; // In ms
type RetryError = { retry: boolean; error: any };

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
): Promise<{ retries: number; result: T; ms: number }> {
  let i = 0;
  for (; i <= RETRY_BACKOFF.length; i++) {
    try {
      const start = Date.now();
      const result = await fn();
      const ms = Date.now() - start;
      return { result, retries: i, ms };
    } catch (e) {
      const retryError = e as RetryError;
      if (i < RETRY_BACKOFF.length) {
        if (retryError.retry) {
          console.log(
            `Attempt ${i + 1} failed, waiting ${RETRY_BACKOFF[i]}ms to retry...`,
            Date.now(),
          );
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_BACKOFF[i] + RETRY_JITTER * Math.random()),
          );
          continue;
        }
      }
      if (retryError.error) throw retryError.error;
      else throw e;
    }
  }
  throw new Error('Unreachable');
}

// Lifted from openai's package
export interface LLMMessage {
  /**
   * The contents of the message. `content` is required for all messages, and may be
   * null for assistant messages with function calls.
   */
  content: string | null;

  /**
   * The role of the messages author. One of `system`, `user`, `assistant`, or
   * `function`.
   */
  role: 'system' | 'user' | 'assistant' | 'function';

  /**
   * The name of the author of this message. `name` is required if role is
   * `function`, and it should be the name of the function whose response is in the
   * `content`. May contain a-z, A-Z, 0-9, and underscores, with a maximum length of
   * 64 characters.
   */
  name?: string;

  /**
   * The name and arguments of a function that should be called, as generated by the model.
   */
  function_call?: {
    // The name of the function to call.
    name: string;
    /**
     * The arguments to call the function with, as generated by the model in
     * JSON format. Note that the model does not always generate valid JSON,
     * and may hallucinate parameters not defined by your function schema.
     * Validate the arguments in your code before calling your function.
     */
    arguments: string;
  };
}

// Non-streaming chat completion response
interface CreateChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index?: number;
    message?: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    };
    finish_reason?: string;
  }[];
  usage?: {
    completion_tokens: number;

    prompt_tokens: number;

    total_tokens: number;
  };
}

interface CreateEmbeddingResponse {
  data: {
    index: number;
    object: string;
    embedding: number[];
  }[];
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface CreateChatCompletionRequest {
  /**
   * ID of the model to use.
   * @type {string}
   * @memberof CreateChatCompletionRequest
   */
  model: string;
  // | 'gpt-4'
  // | 'gpt-4-0613'
  // | 'gpt-4-32k'
  // | 'gpt-4-32k-0613'
  // | 'gpt-3.5-turbo'; // <- our default
  /**
   * The messages to generate chat completions for, in the chat format:
   * https://platform.openai.com/docs/guides/chat/introduction
   * @type {Array<ChatCompletionRequestMessage>}
   * @memberof CreateChatCompletionRequest
   */
  messages: LLMMessage[];
  /**
   * What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.  We generally recommend altering this or `top_p` but not both.
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  temperature?: number | null;
  /**
   * An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.  We generally recommend altering this or `temperature` but not both.
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  top_p?: number | null;
  /**
   * How many chat completion choices to generate for each input message.
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  n?: number | null;
  /**
   * If set, partial message deltas will be sent, like in ChatGPT. Tokens will be sent as data-only [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format) as they become available, with the stream terminated by a `data: [DONE]` message.
   * @type {boolean}
   * @memberof CreateChatCompletionRequest
   */
  stream?: boolean | null;
  /**
   *
   * @type {CreateChatCompletionRequestStop}
   * @memberof CreateChatCompletionRequest
   */
  stop?: Array<string> | string;
  /**
   * The maximum number of tokens allowed for the generated answer. By default,
   * the number of tokens the model can return will be (4096 - prompt tokens).
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  max_tokens?: number;
  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on
   * whether they appear in the text so far, increasing the model\'s likelihood
   * to talk about new topics. See more information about frequency and
   * presence penalties:
   * https://platform.openai.com/docs/api-reference/parameter-details
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  presence_penalty?: number | null;
  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on
   * their existing frequency in the text so far, decreasing the model\'s
   * likelihood to repeat the same line verbatim. See more information about
   * presence penalties:
   * https://platform.openai.com/docs/api-reference/parameter-details
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  frequency_penalty?: number | null;
  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   * Accepts a json object that maps tokens (specified by their token ID in the
   * tokenizer) to an associated bias value from -100 to 100. Mathematically,
   * the bias is added to the logits generated by the model prior to sampling.
   * The exact effect will vary per model, but values between -1 and 1 should
   * decrease or increase likelihood of selection; values like -100 or 100
   * should result in a ban or exclusive selection of the relevant token.
   * @type {object}
   * @memberof CreateChatCompletionRequest
   */
  logit_bias?: object | null;
  /**
   * A unique identifier representing your end-user, which can help OpenAI to
   * monitor and detect abuse. Learn more:
   * https://platform.openai.com/docs/guides/safety-best-practices/end-user-ids
   * @type {string}
   * @memberof CreateChatCompletionRequest
   */
  user?: string;
  tools?: {
    // The type of the tool. Currently, only function is supported.
    type: 'function';
    function: {
      /**
       * The name of the function to be called. Must be a-z, A-Z, 0-9, or
       * contain underscores and dashes, with a maximum length of 64.
       */
      name: string;
      /**
       * A description of what the function does, used by the model to choose
       * when and how to call the function.
       */
      description?: string;
      /**
       * The parameters the functions accepts, described as a JSON Schema
       * object. See the guide[1] for examples, and the JSON Schema reference[2]
       * for documentation about the format.
       * [1]: https://platform.openai.com/docs/guides/gpt/function-calling
       * [2]: https://json-schema.org/understanding-json-schema/
       * To describe a function that accepts no parameters, provide the value
       * {"type": "object", "properties": {}}.
       */
      parameters: object;
    };
  }[];
  /**
   * Controls which (if any) function is called by the model. `none` means the
   * model will not call a function and instead generates a message.
   * `auto` means the model can pick between generating a message or calling a
   * function. Specifying a particular function via
   * {"type: "function", "function": {"name": "my_function"}} forces the model
   * to call that function.
   *
   * `none` is the default when no functions are present.
   * `auto` is the default if functions are present.
   */
  tool_choice?:
    | 'none' // none means the model will not call a function and instead generates a message.
    | 'auto' // auto means the model can pick between generating a message or calling a function.
    // Specifies a tool the model should use. Use to force the model to call
    // a specific function.
    | {
        // The type of the tool. Currently, only function is supported.
        type: 'function';
        function: { name: string };
      };
  // Replaced by "tools"
  // functions?: {
  //   /**
  //    * The name of the function to be called. Must be a-z, A-Z, 0-9, or
  //    * contain underscores and dashes, with a maximum length of 64.
  //    */
  //   name: string;
  //   /**
  //    * A description of what the function does, used by the model to choose
  //    * when and how to call the function.
  //    */
  //   description?: string;
  //   /**
  //    * The parameters the functions accepts, described as a JSON Schema
  //    * object. See the guide[1] for examples, and the JSON Schema reference[2]
  //    * for documentation about the format.
  //    * [1]: https://platform.openai.com/docs/guides/gpt/function-calling
  //    * [2]: https://json-schema.org/understanding-json-schema/
  //    * To describe a function that accepts no parameters, provide the value
  //    * {"type": "object", "properties": {}}.
  //    */
  //   parameters: object;
  // }[];
  // /**
  //  * Controls how the model responds to function calls. "none" means the model
  //  * does not call a function, and responds to the end-user. "auto" means the
  //  * model can pick between an end-user or calling a function. Specifying a
  //  * particular function via {"name":\ "my_function"} forces the model to call
  //  *  that function.
  //  * - "none" is the default when no functions are present.
  //  * - "auto" is the default if functions are present.
  //  */
  // function_call?: 'none' | 'auto' | { name: string };
  /**
   * An object specifying the format that the model must output.
   *
   * Setting to { "type": "json_object" } enables JSON mode, which guarantees
   * the message the model generates is valid JSON.
   * *Important*: when using JSON mode, you must also instruct the model to
   * produce JSON yourself via a system or user message. Without this, the model
   * may generate an unending stream of whitespace until the generation reaches
   * the token limit, resulting in a long-running and seemingly "stuck" request.
   * Also note that the message content may be partially cut off if
   * finish_reason="length", which indicates the generation exceeded max_tokens
   * or the conversation exceeded the max context length.
   */
  response_format?: { type: 'text' | 'json_object' };
}

// Checks whether a suffix of s1 is a prefix of s2. For example,
// ('Hello', 'Kira:') -> false
// ('Hello Kira', 'Kira:') -> true
const suffixOverlapsPrefix = (s1: string, s2: string) => {
  for (let i = 1; i <= Math.min(s1.length, s2.length); i++) {
    const suffix = s1.substring(s1.length - i);
    const prefix = s2.substring(0, i);
    if (suffix === prefix) {
      return true;
    }
  }
  return false;
};

export class ChatCompletionContent {
  private readonly body: ReadableStream<Uint8Array>;
  private readonly stopWords: string[];

  constructor(body: ReadableStream<Uint8Array>, stopWords: string[]) {
    this.body = body;
    this.stopWords = stopWords;
  }

  async *readInner() {
    for await (const data of this.splitStream(this.body)) {
      if (data.startsWith('data: ')) {
        try {
          const json = JSON.parse(data.substring('data: '.length)) as {
            choices: { delta: { content?: string } }[];
          };
          if (json.choices[0].delta.content) {
            yield json.choices[0].delta.content;
          }
        } catch (e) {
          // e.g. the last chunk is [DONE] which is not valid JSON.
        }
      }
    }
  }

  // stop words in OpenAI api don't always work.
  // So we have to truncate on our side.
  async *read() {
    let lastFragment = '';
    for await (const data of this.readInner()) {
      lastFragment += data;
      let hasOverlap = false;
      for (const stopWord of this.stopWords) {
        const idx = lastFragment.indexOf(stopWord);
        if (idx >= 0) {
          yield lastFragment.substring(0, idx);
          return;
        }
        if (suffixOverlapsPrefix(lastFragment, stopWord)) {
          hasOverlap = true;
        }
      }
      if (hasOverlap) continue;
      yield lastFragment;
      lastFragment = '';
    }
    yield lastFragment;
  }

  async readAll() {
    let allContent = '';
    for await (const chunk of this.read()) {
      allContent += chunk;
    }
    return allContent;
  }

  async *splitStream(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    let lastFragment = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          // Flush the last fragment now that we're done
          if (lastFragment !== '') {
            yield lastFragment;
          }
          break;
        }
        const data = new TextDecoder().decode(value);
        lastFragment += data;
        const parts = lastFragment.split('\n\n');
        // Yield all except for the last part
        for (let i = 0; i < parts.length - 1; i += 1) {
          yield parts[i];
        }
        // Save the last part as the new last fragment
        lastFragment = parts[parts.length - 1];
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export async function ollamaFetchEmbedding(text: string) {
  const config = getLLMConfig(); // Called at runtime
  const { result } = await retryWithBackoff(async () => {
    const resp = await fetch(config.url + '/api/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: config.embeddingModel, prompt: text }),
    });
    if (resp.status === 404) {
      const error = await resp.text();
      await tryPullOllama(config.embeddingModel, error); // tryPullOllama calls getLLMConfig
      throw new Error(`Failed to fetch embeddings: ${resp.status}`);
    }
    return (await resp.json()).embedding as number[];
  });
  return { embedding: result };
}
// No specific API key check for Ollama needed here by default.
// The getLLMConfig will perform runtime checks for Ollama embedding model dimensions against EMBEDDING_DIMENSION.
// It's important that EMBEDDING_DIMENSION (hardcoded for schema) matches the actual model used at runtime.
// No switch cases for OLLAMA_EMBEDDING_DIMENSION or QWEN_EMBEDDING_DIMENSION needed here,
// as those constants are for runtime configuration, not provider detection based on EMBEDDING_DIMENSION.
// Default case for other dimensions or if no specific keys are found.
// It's hard to detect provider solely based on dimension without API keys.
// This function becomes more of a sanity check for known provider API keys.
}

export interface LLMConfig {
  provider: 'openai' | 'together' | 'ollama' | 'custom';
  url: string; // Should not have a trailing slash
  chatModel: string;
  embeddingModel: string;
  embeddingDimension: number; // Make this mandatory in the config, reflecting the actual model's dim.
  stopWords: string[];
  apiKey: string | undefined;
}

export function getLLMConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() || 'ollama'; // Default to ollama

  if (provider === 'openai' || process.env.OPENAI_API_KEY) {
    if (EMBEDDING_DIMENSION !== OPENAI_EMBEDDING_DIMENSION && !(process.env.LLM_PROVIDER === 'openai')) {
      // If LLM_PROVIDER is explicitly 'openai', user is asserting this choice.
      // Otherwise, if key is present but provider not set, and dimensions mismatch, throw error.
      // This is a runtime check. The schema is already fixed.
      throw new Error(
        `Runtime check: OpenAI is configured or API key found, but its embedding dimension (${OPENAI_EMBEDDING_DIMENSION}) ` +
        `does not match the schema's EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}). ` +
        `To use OpenAI embeddings, ensure the schema's EMBEDDING_DIMENSION in llm.ts is ${OPENAI_EMBEDDING_DIMENSION} and redeploy.`
      );
    }
    return {
      provider: 'openai',
      url: 'https://api.openai.com',
      chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-ada-002',
      embeddingDimension: OPENAI_EMBEDDING_DIMENSION,
      stopWords: [],
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  if (provider === 'together' || process.env.TOGETHER_API_KEY) {
    if (EMBEDDING_DIMENSION !== TOGETHER_EMBEDDING_DIMENSION && !(process.env.LLM_PROVIDER === 'together')) {
      throw new Error(
        `Runtime check: Together.AI is configured or API key found, but its embedding dimension (${TOGETHER_EMBEDDING_DIMENSION}) ` +
        `does not match the schema's EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}). ` +
        `To use Together.AI embeddings, ensure the schema's EMBEDDING_DIMENSION in llm.ts is ${TOGETHER_EMBEDDING_DIMENSION} and redeploy.`
      );
    }
    return {
      provider: 'together',
      url: 'https://api.together.xyz',
      chatModel: process.env.TOGETHER_CHAT_MODEL ?? 'meta-llama/Llama-3-8b-chat-hf',
      embeddingModel:
        process.env.TOGETHER_EMBEDDING_MODEL ?? 'togethercomputer/m2-bert-80M-8k-retrieval',
      embeddingDimension: TOGETHER_EMBEDDING_DIMENSION,
      stopWords: ['<|eot_id|>'],
      apiKey: process.env.TOGETHER_API_KEY,
    };
  }

  if (provider === 'custom' || process.env.LLM_API_URL) {
    const apiKey = process.env.LLM_API_KEY;
    const url = process.env.LLM_API_URL;
    if (!url) throw new Error('LLM_API_URL is required for custom provider.');
    const chatModel = process.env.LLM_MODEL;
    if (!chatModel) throw new Error('LLM_MODEL is required for custom provider.');
    const embeddingModelName = process.env.LLM_EMBEDDING_MODEL;
    if (!embeddingModelName) throw new Error('LLM_EMBEDDING_MODEL is required for custom provider.');
    // For custom provider, user must ensure their embedding model's dimension matches schema's EMBEDDING_DIMENSION.
    // We trust EMBEDDING_DIMENSION from schema for the config.
    return {
      provider: 'custom',
      url,
      chatModel,
      embeddingModel: embeddingModelName,
      embeddingDimension: EMBEDDING_DIMENSION, // Assumes custom model matches schema dimension
      stopWords: [],
      apiKey,
    };
  }

  // Default to Ollama
  const ollamaEmbeddingModelName = process.env.OLLAMA_EMBEDDING_MODEL ?? 'mxbai-embed-large';
  let actualOllamaModelDimension = DEFAULT_OLLAMA_MXBAI_EMBED_LARGE_DIMENSION; // Default for mxbai

  if (ollamaEmbeddingModelName.includes('qwen')) {
    actualOllamaModelDimension = DEFAULT_OLLAMA_QWEN_DIMENSION;
  } else if (ollamaEmbeddingModelName.includes('llama3')) {
    // Add other heuristics if needed, e.g. for llama3 if its dimension is known
    // actualOllamaModelDimension = LLAMA3_DIMENSION_CONSTANT;
  }
  // Add more heuristics for other ollama model names if their dimensions are known and different.

  // Critical Runtime Check: The chosen Ollama embedding model's actual dimension MUST match the schema's EMBEDDING_DIMENSION.
  if (actualOllamaModelDimension !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Ollama configuration error at runtime: The actual dimension of the selected embedding model ` +
      `'${ollamaEmbeddingModelName}' (dimension: ${actualOllamaModelDimension}) ` +
      `does not match the schema's hardcoded EMBEDDING_DIMENSION (${EMBEDDING_DIMENSION}). ` +
      `Please update OLLAMA_EMBEDDING_MODEL in your environment to one compatible with dimension ${EMBEDDING_DIMENSION}, ` +
      `or update the EMBEDDING_DIMENSION constant in convex/util/llm.ts to ${actualOllamaModelDimension} and re-deploy convex functions.`
    );
  }

  return {
    provider: 'ollama',
    url: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    chatModel: process.env.OLLAMA_MODEL ?? 'qwen3',
    embeddingModel: ollamaEmbeddingModelName,
    embeddingDimension: actualOllamaModelDimension, // This must match EMBEDDING_DIMENSION
    stopWords: ['<|eot_id|>', '<|im_end|>', '<|im_start|>'],
    apiKey: undefined,
  };
}

const AuthHeaders = (): Record<string, string> => {
  // This function is called at runtime, so getLLMConfig() is fine.
  const config = getLLMConfig();
  return config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {};
};

// Overload for non-streaming
export async function chatCompletion(
  body: Omit<CreateChatCompletionRequest, 'model'> & {
    model?: CreateChatCompletionRequest['model'];
  } & {
    stream?: false | null | undefined;
  },
): Promise<{ content: string; retries: number; ms: number }>;
// Overload for streaming
export async function chatCompletion(
  body: Omit<CreateChatCompletionRequest, 'model'> & {
    model?: CreateChatCompletionRequest['model'];
  } & {
    stream?: true;
  },
): Promise<{ content: ChatCompletionContent; retries: number; ms: number }>;
export async function chatCompletion(
  body: Omit<CreateChatCompletionRequest, 'model'> & {
    model?: CreateChatCompletionRequest['model'];
  },
) {
  const config = getLLMConfig(); // Called at runtime
  body.model = body.model ?? config.chatModel;
  const stopWords = body.stop ? (typeof body.stop === 'string' ? [body.stop] : body.stop) : [];
  if (config.stopWords) stopWords.push(...config.stopWords);
  console.log(body);
  const {
    result: content,
    retries,
    ms,
  } = await retryWithBackoff(async () => {
    const result = await fetch(config.url + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...AuthHeaders(), // Called at runtime
      },

      body: JSON.stringify(body),
    });
    if (!result.ok) {
      const error = await result.text();
      console.error({ error });
      if (result.status === 404 && config.provider === 'ollama') {
        await tryPullOllama(body.model!, error); // tryPullOllama calls getLLMConfig
      }
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Chat completion failed with code ${result.status}: ${error}`),
      };
    }
    if (body.stream) {
      return new ChatCompletionContent(result.body!, stopWords);
    } else {
      const json = (await result.json()) as CreateChatCompletionResponse;
      const content = json.choices[0].message?.content;
      if (content === undefined) {
        throw new Error('Unexpected result from OpenAI: ' + JSON.stringify(json));
      }
      console.log(content);
      return content;
    }
  });

  return {
    content,
    retries,
    ms,
  };
}

export async function tryPullOllama(model: string, error: string) {
  if (error.includes('try pulling')) {
    console.error('Embedding model not found, pulling from Ollama');
    // getLLMConfig() is called here at runtime.
    const pullResp = await fetch(getLLMConfig().url + '/api/pull', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: model }),
    });
    console.log('Pull response', await pullResp.text());
    throw { retry: true, error: `Dynamically pulled model. Original error: ${error}` };
  }
}

export async function fetchEmbeddingBatch(texts: string[]) {
  const config = getLLMConfig(); // Called at runtime
  if (config.provider === 'ollama') {
    return {
      ollama: true as const,
      embeddings: await Promise.all(
        texts.map(async (t) => (await ollamaFetchEmbedding(t)).embedding), // ollamaFetchEmbedding calls getLLMConfig
      ),
    };
  }
  const {
    result: json,
    retries,
    ms,
  } = await retryWithBackoff(async () => {
    const result = await fetch(config.url + '/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...AuthHeaders(), // Called at runtime
      },

      body: JSON.stringify({
        model: config.embeddingModel,
        input: texts.map((text) => text.replace(/\n/g, ' ')),
      }),
    });
    if (!result.ok) {
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Embedding failed with code ${result.status}: ${await result.text()}`),
      };
    }
    return (await result.json()) as CreateEmbeddingResponse;
  });
  if (json.data.length !== texts.length) {
    console.error(json);
    throw new Error('Unexpected number of embeddings');
  }
  const allembeddings = json.data;
  allembeddings.sort((a, b) => a.index - b.index);
  return {
    ollama: false as const,
    embeddings: allembeddings.map(({ embedding }) => embedding),
    usage: json.usage?.total_tokens,
    retries,
    ms,
  };
}

export async function fetchEmbedding(text: string) {
  const { embeddings, ...stats } = await fetchEmbeddingBatch([text]); // fetchEmbeddingBatch calls getLLMConfig
  return { embedding: embeddings[0], ...stats };
}

export async function fetchModeration(content: string) {
  const { result: flagged } = await retryWithBackoff(async () => {
    // getLLMConfig() is called by AuthHeaders()
    const result = await fetch(getLLMConfig().url + '/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...AuthHeaders(),
      },

      body: JSON.stringify({
        input: content,
      }),
    });
    if (!result.ok) {
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Embedding failed with code ${result.status}: ${await result.text()}`),
      };
    }
    return (await result.json()) as { results: { flagged: boolean }[] };
  });
  return flagged;
}

// Retry after this much time, based on the retry number.
const RETRY_BACKOFF = [1000, 10_000, 20_000]; // In ms
const RETRY_JITTER = 100; // In ms
type RetryError = { retry: boolean; error: any };

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
): Promise<{ retries: number; result: T; ms: number }> {
  let i = 0;
  for (; i <= RETRY_BACKOFF.length; i++) {
    try {
      const start = Date.now();
      const result = await fn();
      const ms = Date.now() - start;
      return { result, retries: i, ms };
    } catch (e) {
      const retryError = e as RetryError;
      if (i < RETRY_BACKOFF.length) {
        if (retryError.retry) {
          console.log(
            `Attempt ${i + 1} failed, waiting ${RETRY_BACKOFF[i]}ms to retry...`,
            Date.now(),
          );
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_BACKOFF[i] + RETRY_JITTER * Math.random()),
          );
          continue;
        }
      }
      if (retryError.error) throw retryError.error;
      else throw e;
    }
  }
  throw new Error('Unreachable');
}

// Lifted from openai's package
export interface LLMMessage {
  /**
   * The contents of the message. `content` is required for all messages, and may be
   * null for assistant messages with function calls.
   */
  content: string | null;

  /**
   * The role of the messages author. One of `system`, `user`, `assistant`, or
   * `function`.
   */
  role: 'system' | 'user' | 'assistant' | 'function';

  /**
   * The name of the author of this message. `name` is required if role is
   * `function`, and it should be the name of the function whose response is in the
   * `content`. May contain a-z, A-Z, 0-9, and underscores, with a maximum length of
   * 64 characters.
   */
  name?: string;

  /**
   * The name and arguments of a function that should be called, as generated by the model.
   */
  function_call?: {
    // The name of the function to call.
    name: string;
    /**
     * The arguments to call the function with, as generated by the model in
     * JSON format. Note that the model does not always generate valid JSON,
     * and may hallucinate parameters not defined by your function schema.
     * Validate the arguments in your code before calling your function.
     */
    arguments: string;
  };
}

// Non-streaming chat completion response
interface CreateChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index?: number;
    message?: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    };
    finish_reason?: string;
  }[];
  usage?: {
    completion_tokens: number;

    prompt_tokens: number;

    total_tokens: number;
  };
}

interface CreateEmbeddingResponse {
  data: {
    index: number;
    object: string;
    embedding: number[];
  }[];
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface CreateChatCompletionRequest {
  /**
   * ID of the model to use.
   * @type {string}
   * @memberof CreateChatCompletionRequest
   */
  model: string;
  // | 'gpt-4'
  // | 'gpt-4-0613'
  // | 'gpt-4-32k'
  // | 'gpt-4-32k-0613'
  // | 'gpt-3.5-turbo'; // <- our default
  /**
   * The messages to generate chat completions for, in the chat format:
   * https://platform.openai.com/docs/guides/chat/introduction
   * @type {Array<ChatCompletionRequestMessage>}
   * @memberof CreateChatCompletionRequest
   */
  messages: LLMMessage[];
  /**
   * What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.  We generally recommend altering this or `top_p` but not both.
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  temperature?: number | null;
  /**
   * An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.  We generally recommend altering this or `temperature` but not both.
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  top_p?: number | null;
  /**
   * How many chat completion choices to generate for each input message.
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  n?: number | null;
  /**
   * If set, partial message deltas will be sent, like in ChatGPT. Tokens will be sent as data-only [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format) as they become available, with the stream terminated by a `data: [DONE]` message.
   * @type {boolean}
   * @memberof CreateChatCompletionRequest
   */
  stream?: boolean | null;
  /**
   *
   * @type {CreateChatCompletionRequestStop}
   * @memberof CreateChatCompletionRequest
   */
  stop?: Array<string> | string;
  /**
   * The maximum number of tokens allowed for the generated answer. By default,
   * the number of tokens the model can return will be (4096 - prompt tokens).
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  max_tokens?: number;
  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on
   * whether they appear in the text so far, increasing the model\'s likelihood
   * to talk about new topics. See more information about frequency and
   * presence penalties:
   * https://platform.openai.com/docs/api-reference/parameter-details
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  presence_penalty?: number | null;
  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on
   * their existing frequency in the text so far, decreasing the model\'s
   * likelihood to repeat the same line verbatim. See more information about
   * presence penalties:
   * https://platform.openai.com/docs/api-reference/parameter-details
   * @type {number}
   * @memberof CreateChatCompletionRequest
   */
  frequency_penalty?: number | null;
  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   * Accepts a json object that maps tokens (specified by their token ID in the
   * tokenizer) to an associated bias value from -100 to 100. Mathematically,
   * the bias is added to the logits generated by the model prior to sampling.
   * The exact effect will vary per model, but values between -1 and 1 should
   * decrease or increase likelihood of selection; values like -100 or 100
   * should result in a ban or exclusive selection of the relevant token.
   * @type {object}
   * @memberof CreateChatCompletionRequest
   */
  logit_bias?: object | null;
  /**
   * A unique identifier representing your end-user, which can help OpenAI to
   * monitor and detect abuse. Learn more:
   * https://platform.openai.com/docs/guides/safety-best-practices/end-user-ids
   * @type {string}
   * @memberof CreateChatCompletionRequest
   */
  user?: string;
  tools?: {
    // The type of the tool. Currently, only function is supported.
    type: 'function';
    function: {
      /**
       * The name of the function to be called. Must be a-z, A-Z, 0-9, or
       * contain underscores and dashes, with a maximum length of 64.
       */
      name: string;
      /**
       * A description of what the function does, used by the model to choose
       * when and how to call the function.
       */
      description?: string;
      /**
       * The parameters the functions accepts, described as a JSON Schema
       * object. See the guide[1] for examples, and the JSON Schema reference[2]
       * for documentation about the format.
       * [1]: https://platform.openai.com/docs/guides/gpt/function-calling
       * [2]: https://json-schema.org/understanding-json-schema/
       * To describe a function that accepts no parameters, provide the value
       * {"type": "object", "properties": {}}.
       */
      parameters: object;
    };
  }[];
  /**
   * Controls which (if any) function is called by the model. `none` means the
   * model will not call a function and instead generates a message.
   * `auto` means the model can pick between generating a message or calling a
   * function. Specifying a particular function via
   * {"type: "function", "function": {"name": "my_function"}} forces the model
   * to call that function.
   *
   * `none` is the default when no functions are present.
   * `auto` is the default if functions are present.
   */
  tool_choice?:
    | 'none' // none means the model will not call a function and instead generates a message.
    | 'auto' // auto means the model can pick between generating a message or calling a function.
    // Specifies a tool the model should use. Use to force the model to call
    // a specific function.
    | {
        // The type of the tool. Currently, only function is supported.
        type: 'function';
        function: { name: string };
      };
  // Replaced by "tools"
  // functions?: {
  //   /**
  //    * The name of the function to be called. Must be a-z, A-Z, 0-9, or
  //    * contain underscores and dashes, with a maximum length of 64.
  //    */
  //   name: string;
  //   /**
  //    * A description of what the function does, used by the model to choose
  //    * when and how to call the function.
  //    */
  //   description?: string;
  //   /**
  //    * The parameters the functions accepts, described as a JSON Schema
  //    * object. See the guide[1] for examples, and the JSON Schema reference[2]
  //    * for documentation about the format.
  //    * [1]: https://platform.openai.com/docs/guides/gpt/function-calling
  //    * [2]: https://json-schema.org/understanding-json-schema/
  //    * To describe a function that accepts no parameters, provide the value
  //    * {"type": "object", "properties": {}}.
  //    */
  //   parameters: object;
  // }[];
  // /**
  //  * Controls how the model responds to function calls. "none" means the model
  //  * does not call a function, and responds to the end-user. "auto" means the
  //  * model can pick between an end-user or calling a function. Specifying a
  //  * particular function via {"name":\ "my_function"} forces the model to call
  //  *  that function.
  //  * - "none" is the default when no functions are present.
  //  * - "auto" is the default if functions are present.
  //  */
  // function_call?: 'none' | 'auto' | { name: string };
  /**
   * An object specifying the format that the model must output.
   *
   * Setting to { "type": "json_object" } enables JSON mode, which guarantees
   * the message the model generates is valid JSON.
   * *Important*: when using JSON mode, you must also instruct the model to
   * produce JSON yourself via a system or user message. Without this, the model
   * may generate an unending stream of whitespace until the generation reaches
   * the token limit, resulting in a long-running and seemingly "stuck" request.
   * Also note that the message content may be partially cut off if
   * finish_reason="length", which indicates the generation exceeded max_tokens
   * or the conversation exceeded the max context length.
   */
  response_format?: { type: 'text' | 'json_object' };
}

// Checks whether a suffix of s1 is a prefix of s2. For example,
// ('Hello', 'Kira:') -> false
// ('Hello Kira', 'Kira:') -> true
const suffixOverlapsPrefix = (s1: string, s2: string) => {
  for (let i = 1; i <= Math.min(s1.length, s2.length); i++) {
    const suffix = s1.substring(s1.length - i);
    const prefix = s2.substring(0, i);
    if (suffix === prefix) {
      return true;
    }
  }
  return false;
};

export class ChatCompletionContent {
  private readonly body: ReadableStream<Uint8Array>;
  private readonly stopWords: string[];

  constructor(body: ReadableStream<Uint8Array>, stopWords: string[]) {
    this.body = body;
    this.stopWords = stopWords;
  }

  async *readInner() {
    for await (const data of this.splitStream(this.body)) {
      if (data.startsWith('data: ')) {
        try {
          const json = JSON.parse(data.substring('data: '.length)) as {
            choices: { delta: { content?: string } }[];
          };
          if (json.choices[0].delta.content) {
            yield json.choices[0].delta.content;
          }
        } catch (e) {
          // e.g. the last chunk is [DONE] which is not valid JSON.
        }
      }
    }
  }

  // stop words in OpenAI api don't always work.
  // So we have to truncate on our side.
  async *read() {
    let lastFragment = '';
    for await (const data of this.readInner()) {
      lastFragment += data;
      let hasOverlap = false;
      for (const stopWord of this.stopWords) {
        const idx = lastFragment.indexOf(stopWord);
        if (idx >= 0) {
          yield lastFragment.substring(0, idx);
          return;
        }
        if (suffixOverlapsPrefix(lastFragment, stopWord)) {
          hasOverlap = true;
        }
      }
      if (hasOverlap) continue;
      yield lastFragment;
      lastFragment = '';
    }
    yield lastFragment;
  }

  async readAll() {
    let allContent = '';
    for await (const chunk of this.read()) {
      allContent += chunk;
    }
    return allContent;
  }

  async *splitStream(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    let lastFragment = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          // Flush the last fragment now that we're done
          if (lastFragment !== '') {
            yield lastFragment;
          }
          break;
        }
        const data = new TextDecoder().decode(value);
        lastFragment += data;
        const parts = lastFragment.split('\n\n');
        // Yield all except for the last part
        for (let i = 0; i < parts.length - 1; i += 1) {
          yield parts[i];
        }
        // Save the last part as the new last fragment
        lastFragment = parts[parts.length - 1];
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export async function ollamaFetchEmbedding(text: string) {
  const config = getLLMConfig(); // Called at runtime
  const { result } = await retryWithBackoff(async () => {
    const resp = await fetch(config.url + '/api/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: config.embeddingModel, prompt: text }),
    });
    if (resp.status === 404) {
      const error = await resp.text();
      await tryPullOllama(config.embeddingModel, error); // tryPullOllama calls getLLMConfig
      throw new Error(`Failed to fetch embeddings: ${resp.status}`);
    }
    return (await resp.json()).embedding as number[];
  });
  return { embedding: result };
}
