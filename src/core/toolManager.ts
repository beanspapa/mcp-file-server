import { MCPManager } from "./mcpManager.js";
import { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | {
      type: "resource";
      resource: {
        uri: string;
        mimeType: string;
        text?: string;
        blob?: string;
      };
    };

export interface MCPToolManager extends MCPManager {
  // Model-controlled
  listTools(cursor?: string): Promise<{
    tools: Tool[];
    nextCursor?: string;
  }>;
  executeTool(
    name: string,
    params: Record<string, any>
  ): Promise<{
    content: ToolContent[];
    isError?: boolean;
  }>;
  onToolListChanged(callback: () => void): void;
}
