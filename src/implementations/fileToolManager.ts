import { MCPToolManager, ToolContent } from "../core/toolManager.js";
import { FileService } from "../services/fileService.js";
import { McpError, ErrorCode, Tool } from "@modelcontextprotocol/sdk/types.js";
import { FileOperation } from "../types/index.js";
import * as path from "path";

export class FileToolManager implements MCPToolManager {
  private fileService: FileService;
  private toolListChangedCallbacks: (() => void)[] = [];
  private tools: Tool[] = [];

  constructor(fileService: FileService) {
    this.fileService = fileService;
  }

  async initialize(): Promise<void> {
    // 도구 디렉토리가 존재하는지 확인하고 없으면 생성
    const operation: FileOperation = {
      type: "list",
      path: "tools",
    };
    const result = await this.fileService.handleOperation(operation);
    if (!result.success) {
      // 디렉토리가 없으면 생성
      console.log("Tools directory not found, creating it.");
      const createDirOperation: FileOperation = {
        type: "createDirectory",
        path: "tools",
      };
      const createResult = await this.fileService.handleOperation(
        createDirOperation
      );
      if (!createResult.success) {
        // Handle error during directory creation if necessary
        console.error("Failed to create tools directory:", createResult.error);
        throw new McpError(
          ErrorCode.InternalError,
          "Failed to initialize tools directory"
        );
      }
    }

    // 기본 도구 설정
    this.tools = [
      {
        name: "readFile",
        description: "Read a file from the filesystem",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file to read",
            },
          },
          required: ["path"],
        },
        annotations: {
          readOnlyHint: true,
        },
      },
      {
        name: "writeFile",
        description: "Write content to a file",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file to write",
            },
            content: {
              type: "string",
              description: "Content to write to the file",
            },
          },
          required: ["path", "content"],
        },
        annotations: {
          destructiveHint: true,
        },
      },
      {
        name: "listDirectory",
        description: "List contents of a directory",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the directory to list",
            },
          },
          required: ["path"],
        },
        annotations: {
          readOnlyHint: true,
        },
      },
      {
        name: "deleteFile",
        description: "Delete a file from the filesystem",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file to delete",
            },
          },
          required: ["path"],
        },
        annotations: {
          destructiveHint: true,
        },
      },
    ];
  }

  async cleanup(): Promise<void> {
    // 필요한 정리 작업 수행
  }

  async listTools(cursor?: string): Promise<{
    tools: Tool[];
    nextCursor?: string;
  }> {
    return { tools: this.tools };
  }

  async executeTool(
    name: string,
    params: Record<string, any>
  ): Promise<{
    content: ToolContent[];
    isError?: boolean;
  }> {
    try {
      switch (name) {
        case "readFile":
          return await this.executeReadFile(params);
        case "writeFile":
          return await this.executeWriteFile(params);
        case "listDirectory":
          return await this.executeListDirectory(params);
        case "deleteFile":
          return await this.executeDeleteFile(params);
        default:
          throw new McpError(ErrorCode.InternalError, `Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text:
              error instanceof Error ? error.message : "Unknown error occurred",
          },
        ],
        isError: true,
      };
    }
  }

  onToolListChanged(callback: () => void): void {
    this.toolListChangedCallbacks.push(callback);
  }

  private notifyToolListChanged(): void {
    for (const callback of this.toolListChangedCallbacks) {
      callback();
    }
  }

  private async executeReadFile(params: Record<string, any>): Promise<{
    content: ToolContent[];
    isError?: boolean;
  }> {
    const { path: filePath } = params;
    const operation: FileOperation = {
      type: "read",
      path: filePath,
    };
    const result = await this.fileService.handleOperation(operation);

    if (!result.success || !result.data) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read file: ${filePath}`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: result.data,
        },
      ],
    };
  }

  private async executeWriteFile(params: Record<string, any>): Promise<{
    content: ToolContent[];
    isError?: boolean;
  }> {
    const { path: filePath, content } = params;
    const operation: FileOperation = {
      type: "write",
      path: filePath,
      content,
    };
    const result = await this.fileService.handleOperation(operation);

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to write file: ${filePath}`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: `Successfully wrote to file: ${filePath}`,
        },
      ],
    };
  }

  private async executeListDirectory(params: Record<string, any>): Promise<{
    content: ToolContent[];
    isError?: boolean;
  }> {
    const { path: dirPath } = params;
    const operation: FileOperation = {
      type: "list",
      path: dirPath,
    };
    const result = await this.fileService.handleOperation(operation);

    if (!result.success || !result.data) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list directory: ${dirPath}`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }

  private async executeDeleteFile(params: Record<string, any>): Promise<{
    content: ToolContent[];
    isError?: boolean;
  }> {
    const { path: filePath } = params;
    const operation: FileOperation = {
      type: "delete",
      path: filePath,
    };
    const result = await this.fileService.handleOperation(operation);

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to delete file: ${filePath}`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: `Successfully deleted file: ${filePath}`,
        },
      ],
    };
  }
}
