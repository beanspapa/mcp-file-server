import { MCPPromptManager } from "../core/promptManager.js";
import { FileService } from "../services/fileService.js";
import {
  McpError,
  ErrorCode,
  Prompt,
  PromptMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { FileOperation } from "../types/index.js";

export class FilePromptManager implements MCPPromptManager {
  private fileService: FileService;
  private promptListChangedCallbacks: (() => void)[] = [];

  constructor(fileService: FileService) {
    this.fileService = fileService;
  }

  async initialize(): Promise<void> {
    // 프롬프트 디렉토리가 존재하는지 확인하고 없으면 생성
    const operation: FileOperation = {
      type: "list",
      path: "prompts",
    };
    const result = await this.fileService.handleOperation(operation);
    if (!result.success) {
      // 디렉토리가 없으면 생성
      console.log("Prompts directory not found, creating it.");
      const createDirOperation: FileOperation = {
        type: "createDirectory",
        path: "prompts",
      };
      const createResult = await this.fileService.handleOperation(
        createDirOperation
      );
      if (!createResult.success) {
        // Handle error during directory creation if necessary
        console.error(
          "Failed to create prompts directory:",
          createResult.error
        );
        throw new McpError(
          ErrorCode.InternalError,
          "Failed to initialize prompts directory"
        );
      }
    }
  }

  async cleanup(): Promise<void> {
    // 필요한 정리 작업 수행
  }

  async listPrompts(cursor?: string): Promise<{
    prompts: Prompt[];
    nextCursor?: string;
  }> {
    try {
      const operation: FileOperation = {
        type: "list",
        path: "prompts",
      };
      const result = await this.fileService.handleOperation(operation);

      if (!result.success) {
        throw new McpError(ErrorCode.InternalError, "Failed to list prompts");
      }

      const prompts: Prompt[] = [];
      // result.data가 배열인지 먼저 확인 (FileService의 list 결과가 예상과 다를 경우 대비)
      if (Array.isArray(result.data)) {
        for (const file of result.data as string[]) {
          if (file.endsWith(".json")) {
            const filePath = `prompts/${file}`;
            const readOperation: FileOperation = {
              type: "read",
              path: filePath,
            };
            try {
              const readResult = await this.fileService.handleOperation(
                readOperation
              );
              if (readResult.success && readResult.data) {
                // Parse JSON safely
                let promptData: any;
                try {
                  promptData = JSON.parse(readResult.data);
                } catch (parseError) {
                  console.error(
                    `Failed to parse JSON from ${filePath}:`,
                    parseError
                  );
                  continue; // Skip this file if JSON parsing fails
                }

                // Extract only fields defined in the MCP Prompt schema
                if (promptData && typeof promptData.name === "string") {
                  const validPrompt: Prompt = {
                    name: promptData.name,
                    // Add description and arguments if they exist and are valid (optional)
                    ...(promptData.description && {
                      description: String(promptData.description),
                    }),
                    ...(Array.isArray(promptData.arguments) && {
                      arguments: promptData.arguments,
                    }),
                  };
                  prompts.push(validPrompt);
                } else {
                  console.warn(
                    `Skipping ${filePath}: missing or invalid 'name' field.`
                  );
                }
              } else if (!readResult.success) {
                console.warn(
                  `Skipping ${filePath}: failed to read - ${readResult.error}`
                );
              }
            } catch (readError) {
              console.error(`Error reading file ${filePath}:`, readError);
              // Continue to the next file even if one file fails to read
            }
          }
        }
      } else {
        console.warn(
          "FileService did not return an array for list operation on prompts directory."
        );
      }

      return { prompts };
    } catch (error) {
      // Catch errors from the initial list operation or re-thrown errors
      console.error("Error in listPrompts:", error);
      // Ensure we throw an McpError for consistency
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list prompts: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async getPrompt(
    name: string,
    args?: Record<string, any>
  ): Promise<{
    description: string;
    messages: PromptMessage[];
  }> {
    try {
      const operation: FileOperation = {
        type: "read",
        path: `prompts/${name}.json`,
      };
      const result = await this.fileService.handleOperation(operation);

      if (!result.success || !result.data) {
        throw new McpError(ErrorCode.InternalError, `Prompt ${name} not found`);
      }

      // Parse the prompt file content (assuming it matches the new structure)
      const promptDefinition = JSON.parse(result.data) as {
        name: string;
        description?: string;
        arguments?: { name: string; required?: boolean }[];
        messageTemplates?: PromptMessage[];
      };

      // Validate required arguments
      if (promptDefinition.arguments) {
        for (const argDef of promptDefinition.arguments) {
          if (argDef.required && (!args || args[argDef.name] === undefined)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Missing required argument: ${argDef.name}`
            );
          }
        }
      }

      // Process message templates
      const messages: PromptMessage[] = [];
      if (promptDefinition.messageTemplates) {
        for (const template of promptDefinition.messageTemplates) {
          // Simple text content templating for now
          if (template.content instanceof Array) {
            const processedContent = template.content.map((contentItem) => {
              if (contentItem.type === "text" && contentItem.text) {
                let processedText = contentItem.text;
                if (args) {
                  for (const key in args) {
                    processedText = processedText.replace(
                      new RegExp(`{{${key}}}`, "g"),
                      String(args[key]) // Ensure argument is string
                    );
                  }
                }
                // Remove placeholders for missing optional args
                processedText = processedText.replace(/{{.*?}}/g, "");
                return { ...contentItem, text: processedText };
              }
              return contentItem; // Keep non-text or non-template items as is
            });
            messages.push({ ...template, content: processedContent as any }); // Type assertion needed
          } else {
            messages.push(template); // Keep non-array content as is
          }
        }
      }

      return {
        description: promptDefinition.description || "",
        messages: messages,
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error; // Re-throw MCP errors directly
      }
      // Wrap other errors
      console.error(`Error processing prompt ${name}:`, error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to process prompt ${name}`
      );
    }
  }

  onPromptListChanged(callback: () => void): void {
    this.promptListChangedCallbacks.push(callback);
  }

  private notifyPromptListChanged(): void {
    for (const callback of this.promptListChangedCallbacks) {
      callback();
    }
  }
}
