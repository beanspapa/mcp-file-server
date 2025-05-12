export interface MCPManager {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
} 