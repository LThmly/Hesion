import { parseModelId, type StreamParams } from "./types";
import { streamOpenAI, streamOpenRouter } from "./openai";
import { streamAnthropic } from "./anthropic";
import { streamGemini } from "./gemini";

export async function streamChat(params: StreamParams): Promise<void> {
  const { provider } = parseModelId(params.modelId);
  switch (provider) {
    case "openai":
      return streamOpenAI(params);
    case "openrouter":
      return streamOpenRouter(params);
    case "anthropic":
      return streamAnthropic(params);
    case "gemini":
      return streamGemini(params);
    default:
      params.onChunk({
        type: "error",
        error: `Unknown provider: ${provider as string}`,
      });
  }
}

export { parseModelId };
