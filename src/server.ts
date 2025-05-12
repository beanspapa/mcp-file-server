import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  McpError,
  ErrorCode,
  Prompt,
  PromptMessage,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";
import { z } from "zod";

// 새로운 구현체 import
import { FileResourceManager } from "./implementations/fileResourceManager.js";
import { FilePromptManager } from "./implementations/filePromptManager.js";
import { FileToolManager } from "./implementations/fileToolManager.js";
import { FileService } from "./services/fileService.js";
import { FileConfig } from "./types/index.js";

export class MCPServer {
  private server: Server;
  private resourceManager?: FileResourceManager;
  private promptManager?: FilePromptManager;
  private toolManager?: FileToolManager;
  private fileService?: FileService;

  constructor() {
    this.server = new Server(
      {
        name: "mcp-file-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    // Only setup handlers that DON'T depend on managers here
    this.setupServerHandlers();
    this.setupConfigHandlers();
    this.setupErrorHandling(); // Error handling can also be set up early
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupConfigHandlers(): void {
    const SetConfigRequestSchema = z.object({
      method: z.literal("server/config"),
      params: z.object({
        config: z.object({
          allowedDirectories: z.array(z.string()),
          allowedExtensions: z.array(z.string()),
        }),
      }),
    });

    this.server.setRequestHandler(
      SetConfigRequestSchema,
      async (request: { params: { config: FileConfig } }) => {
        try {
          const config: FileConfig = request.params.config;

          // FileService initialization
          this.fileService = new FileService(config);

          // Manager initialization
          this.resourceManager = new FileResourceManager(this.fileService);
          this.toolManager = new FileToolManager(this.fileService);
          this.promptManager = new FilePromptManager(this.fileService);

          // Manager initialization execution
          await Promise.all([
            this.resourceManager.initialize(),
            this.toolManager.initialize(),
            this.promptManager.initialize(),
          ]);

          // *** Setup manager-dependent handlers AFTER managers are initialized ***
          this.setupToolHandlers();
          this.setupResourceHandlers();
          this.setupPromptHandlers();
          // ********************************************************************

          return { success: true };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to set configuration: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    );
  }

  private setupServerHandlers(): void {
    const ServerInfoRequestSchema = z.object({
      method: z.literal("server/info"),
    });

    this.server.setRequestHandler(ServerInfoRequestSchema, async () => {
      return {
        name: "mcp-file-server",
        version: "1.0.0",
      };
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.toolManager) {
        throw new McpError(ErrorCode.InternalError, "Server not configured");
      }
      return await this.toolManager.listTools();
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra) => {
        if (!this.toolManager) {
          throw new McpError(ErrorCode.InternalError, "Server not configured");
        }
        try {
          const result = await this.toolManager.executeTool(
            request.params.name,
            request.params.arguments || {}
          );
          return {
            content: result.content,
            _meta: extra,
          };
        } catch (error: any) {
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error.message}`
          );
        }
      }
    );
  }

  private setupResourceHandlers(): void {
    const ListResourcesRequestSchema = z.object({
      method: z.literal("resources/list"),
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      if (!this.resourceManager) {
        throw new McpError(ErrorCode.InternalError, "Server not configured");
      }
      try {
        const { resources } = await this.resourceManager.listResources();
        return {
          resources: resources.map((resource) => ({
            name: resource.name,
            uri: resource.uri,
          })),
        };
      } catch (error) {
        throw error;
      }
    });
  }

  private setupPromptHandlers(): void {
    // Handler for prompts/list
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      if (!this.promptManager) {
        throw new McpError(
          ErrorCode.InternalError,
          "Prompt manager not initialized"
        );
      }
      try {
        // Validate parameters implicitly via setRequestHandler schema matching
        // Access params via request.params
        const params = request.params || {};
        // Call listPrompts with only the cursor, if it exists
        return await this.promptManager.listPrompts(params.cursor);
      } catch (error: any) {
        console.error("Error listing prompts:", error);
        if (error instanceof McpError) {
          throw error;
        }
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.message}`
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list prompts: ${error.message}`
        );
      }
    });

    // Handler for prompts/get
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (!this.promptManager) {
        throw new McpError(
          ErrorCode.InternalError,
          "Prompt manager not initialized"
        );
      }
      try {
        // Validate parameters implicitly via setRequestHandler schema matching
        // Access params via request.params
        const params = request.params;
        if (!params?.name) {
          // Explicit check for safety, though schema should enforce
          throw new McpError(
            ErrorCode.InvalidParams,
            "Missing required parameter: name"
          );
        }
        return await this.promptManager.getPrompt(
          params.name,
          params.arguments
        );
      } catch (error: any) {
        const promptName = request.params?.name || "unknown";
        console.error(`Error getting prompt ${promptName}:`, error);
        if (error instanceof McpError) {
          throw error;
        }
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.message}`
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to get prompt: ${error.message}`
        );
      }
    });
  }

  async run(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.log("MCP File Server started");
    } catch (error) {
      console.error("Failed to start MCP File Server:", error);
      throw error;
    }
  }
}

// 서버 실행
const currentFilePath = fileURLToPath(import.meta.url);
if (currentFilePath === process.argv[1]) {
  const server = new MCPServer();
  server.run().catch(console.error);
}
