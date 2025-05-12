import { MCPResourceManager } from "../core/resourceManager.js";
import { FileService } from "../services/fileService.js";
import {
  McpError,
  ErrorCode,
  Resource,
  ResourceContents,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import { FileOperation } from "../types/index.js";
import * as path from "path";

export class FileResourceManager implements MCPResourceManager {
  private fileService: FileService;
  private resourceListChangedCallbacks: (() => void)[] = [];
  private resourceUpdatedCallbacks: ((uri: string) => void)[] = [];
  private resourceTemplates: ResourceTemplate[] = [];

  constructor(fileService: FileService) {
    this.fileService = fileService;
  }

  async initialize(): Promise<void> {
    // 리소스 디렉토리가 존재하는지 확인하고 없으면 생성
    const operation: FileOperation = {
      type: "list",
      path: "resources",
    };
    const result = await this.fileService.handleOperation(operation);
    if (!result.success) {
      // 디렉토리가 없으면 생성
      console.log("Resources directory not found, creating it.");
      const createDirOperation: FileOperation = {
        type: "createDirectory",
        path: "resources",
      };
      const createResult = await this.fileService.handleOperation(
        createDirOperation
      );
      if (!createResult.success) {
        // Handle error during directory creation if necessary
        console.error(
          "Failed to create resources directory:",
          createResult.error
        );
        throw new McpError(
          ErrorCode.InternalError,
          "Failed to initialize resources directory"
        );
      }
    }

    // 기본 리소스 템플릿 설정
    this.resourceTemplates = [
      {
        uriTemplate: "resources/{name}.txt",
        name: "Text File",
        description: "Create a new text file",
        mimeType: "text/plain",
      },
      {
        uriTemplate: "resources/{name}.json",
        name: "JSON File",
        description: "Create a new JSON file",
        mimeType: "application/json",
      },
    ];
  }

  async cleanup(): Promise<void> {
    // 필요한 정리 작업 수행
  }

  async listResources(cursor?: string): Promise<{
    resources: Resource[];
    nextCursor?: string;
  }> {
    try {
      const operation: FileOperation = {
        type: "list",
        path: "resources",
      };
      const result = await this.fileService.handleOperation(operation);

      if (!result.success) {
        throw new McpError(ErrorCode.InternalError, "Failed to list resources");
      }

      const resources: Resource[] = [];
      for (const file of result.data as string[]) {
        if (file === ".gitkeep") continue;

        const filePath = path.join("resources", file);
        const readOperation: FileOperation = {
          type: "read",
          path: filePath,
        };
        const readResult = await this.fileService.handleOperation(
          readOperation
        );
        if (readResult.success && readResult.data) {
          const content = readResult.data;
          const resource: Resource = {
            id: file,
            uri: `file://${filePath}`,
            name: file,
            path: filePath,
            type: "file",
            access: {
              permissions: [{ action: "read", resource: filePath }],
            },
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              size: content.length,
              mimeType: this.getMimeType(file),
              description: `File at ${filePath}`,
            },
          };
          resources.push(resource);
        }
      }

      return { resources };
    } catch (error) {
      // Rethrow the original error or wrap it with more context
      const message = `Failed to list resources: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      throw new McpError(
        ErrorCode.InternalError,
        message,
        error instanceof McpError ? error.data : undefined
      );
    }
  }

  async readResource(uri: string): Promise<ResourceContents[]> {
    try {
      const filePath = uri.replace("file://", "");
      const operation: FileOperation = {
        type: "read",
        path: filePath,
      };
      const result = await this.fileService.handleOperation(operation);

      if (!result.success || !result.data) {
        throw new McpError(
          ErrorCode.InternalError,
          `Resource ${uri} not found`
        );
      }

      const content: ResourceContents = {
        type: "resource",
        uri,
        resource: {
          uri,
          mimeType: this.getMimeType(filePath),
          text: result.data,
        },
      };

      return [content];
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read resource ${uri}`
      );
    }
  }

  async listResourceTemplates(): Promise<ResourceTemplate[]> {
    return this.resourceTemplates;
  }

  async subscribeToResource(uri: string): Promise<void> {
    // TODO: 파일 시스템 감시 구현
  }

  onResourceListChanged(callback: () => void): void {
    this.resourceListChangedCallbacks.push(callback);
  }

  onResourceUpdated(callback: (uri: string) => void): void {
    this.resourceUpdatedCallbacks.push(callback);
  }

  private notifyResourceListChanged(): void {
    for (const callback of this.resourceListChangedCallbacks) {
      callback();
    }
  }

  private notifyResourceUpdated(uri: string): void {
    for (const callback of this.resourceUpdatedCallbacks) {
      callback(uri);
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".txt": "text/plain",
      ".json": "application/json",
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".ts": "application/typescript",
      ".md": "text/markdown",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }
}
