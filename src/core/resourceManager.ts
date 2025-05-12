import { MCPManager } from "./mcpManager.js";
import {
  Resource,
  ResourceContents,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";

export interface MCPResourceManager extends MCPManager {
  // User-controlled
  listResources(cursor?: string): Promise<{
    resources: Resource[];
    nextCursor?: string;
  }>;
  readResource(uri: string): Promise<ResourceContents[]>;
  listResourceTemplates(): Promise<ResourceTemplate[]>;
  subscribeToResource(uri: string): Promise<void>;
  onResourceListChanged(callback: () => void): void;
  onResourceUpdated(callback: (uri: string) => void): void;
}
