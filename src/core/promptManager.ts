import { MCPManager } from "./mcpManager.js";
import {
  Prompt,
  PromptArgument,
  PromptMessage,
  TextContent,
  ImageContent,
  AudioContent,
  EmbeddedResource,
} from "@modelcontextprotocol/sdk/types.js";

export interface MCPPromptManager extends MCPManager {
  // User-controlled
  listPrompts(cursor?: string): Promise<{
    prompts: Prompt[];
    nextCursor?: string;
  }>;
  getPrompt(
    name: string,
    args?: Record<string, any>
  ): Promise<{
    description: string;
    messages: PromptMessage[];
  }>;
  onPromptListChanged(callback: () => void): void;
}
