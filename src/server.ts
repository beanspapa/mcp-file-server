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
  ListResourcesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";
import { z } from "zod";
import path from "path";

// 새로운 구현체 import
import { FileResourceManager } from "./implementations/fileResourceManager.js";
import { FilePromptManager } from "./implementations/filePromptManager.js";
import { FileToolManager } from "./implementations/fileToolManager.js";
import { FileService } from "./services/fileService.js";
import { FileConfig } from "./types/index.js";

export class MCPServer {
  private server: Server;
  private fileService!: FileService;
  private resourceManager!: FileResourceManager;
  private promptManager!: FilePromptManager;
  private toolManager!: FileToolManager;
  private config!: FileConfig;

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
    this.setupErrorHandling(); // Error handling can also be set up early
  }

  async initialize(config: FileConfig): Promise<void> {
    this.config = config;

    this.fileService = new FileService(this.config);

    this.resourceManager = new FileResourceManager(this.fileService);
    this.toolManager = new FileToolManager(this.fileService);
    this.promptManager = new FilePromptManager(this.fileService);

    await Promise.all([
      this.resourceManager.initialize(),
      this.toolManager.initialize(),
      this.promptManager.initialize(),
    ]);

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();

    console.log("MCP File Server initialized with config:", this.config);
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
      return await this.toolManager.listTools();
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra) => {
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
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
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
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      try {
        const params = request.params || {};
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

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        const params = request.params;
        if (!params?.name) {
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

function parseArgs(args: string[]): FileConfig {
  const extensionFlag = "--extensions";
  const extensionIndex = args.indexOf(extensionFlag);

  if (extensionIndex === -1) {
    throw new Error(
      `Missing required argument flag: ${extensionFlag}. Usage: node <script> <dir1> <dir2> ... ${extensionFlag} <ext1>,<ext2>,...`
    );
  }

  const allowedDirectories = args
    .slice(0, extensionIndex)
    .map((dir) => path.resolve(dir));

  if (allowedDirectories.length === 0) {
    console.warn("Warning: No allowed directories specified.");
  }

  const extensionsArg = args[extensionIndex + 1];
  if (!extensionsArg) {
    throw new Error(
      `Missing extension list after ${extensionFlag}. Usage: ... ${extensionFlag} <ext1>,<ext2>,...`
    );
  }

  const allowedExtensions = extensionsArg
    .split(",")
    .map((ext) => ext.trim())
    .filter((ext) => ext.startsWith("."));

  if (allowedExtensions.length === 0) {
    console.warn(
      `Warning: No valid extensions provided after ${extensionFlag}. Allowing all extensions implicitly is generally unsafe.`
    );
  }

  return {
    allowedDirectories,
    allowedExtensions,
  };
}

if (
  require.main === module ||
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const config = parseArgs(args);

      const server = new MCPServer();
      await server.initialize(config);
      await server.run();
    } catch (error) {
      console.error("Failed to start MCP File Server:", error);
      process.exit(1);
    }
  })();
}
