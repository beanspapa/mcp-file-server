import { FileOperation, FileResponse, FileConfig } from "../types/index.js";
import * as fs from "fs/promises";
import * as path from "path";

export class FileService {
  private config: FileConfig;

  constructor(config: FileConfig) {
    this.config = config;
  }

  private isPathAllowed(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    console.log("Checking path:", {
      inputPath: filePath,
      absolutePath,
      allowedDirs: this.config.allowedDirectories,
    });
    return this.config.allowedDirectories.some((dir) =>
      absolutePath.startsWith(path.resolve(dir))
    );
  }

  private isExtensionAllowed(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    console.log("Checking extension:", {
      filePath,
      extension: ext,
      allowedExtensions: this.config.allowedExtensions,
    });
    return this.config.allowedExtensions.includes(ext);
  }

  private validatePath(filePath: string): FileResponse {
    console.log("Validating path:", filePath);

    if (!this.isPathAllowed(filePath)) {
      console.log("Path not allowed");
      return {
        success: false,
        error: "Access to this directory is not allowed",
      };
    }

    if (!this.isExtensionAllowed(filePath)) {
      console.log("Extension not allowed");
      return {
        success: false,
        error: "File type not allowed",
      };
    }

    console.log("Path validation successful");
    return { success: true };
  }

  async handleOperation(operation: FileOperation): Promise<FileResponse> {
    console.log("Handling operation:", operation);

    try {
      if (operation.type === "list" || operation.type === "createDirectory") {
        if (!this.isPathAllowed(operation.path)) {
          console.log("Path not allowed for list/createDirectory");
          return {
            success: false,
            error: "Access to this directory is not allowed",
          };
        }
      } else {
        const validation = this.validatePath(operation.path);
        if (!validation.success) {
          return validation;
        }
      }

      switch (operation.type) {
        case "read":
          console.log("Reading file:", operation.path);
          const content = await fs.readFile(operation.path, "utf-8");
          return { success: true, data: content };

        case "write":
          if (!operation.content) {
            return {
              success: false,
              error: "Content is required for write operation",
            };
          }
          console.log("Writing to file:", operation.path);
          await fs.writeFile(operation.path, operation.content, "utf-8");
          return { success: true };

        case "list":
          console.log("Listing directory:", operation.path);
          const files = await fs.readdir(operation.path);
          return { success: true, data: files };

        case "delete":
          console.log("Deleting file:", operation.path);
          await fs.unlink(operation.path);
          return { success: true };

        case "createDirectory":
          console.log("Creating directory:", operation.path);
          await fs.mkdir(operation.path, { recursive: true });
          return { success: true };

        default:
          return { success: false, error: "Invalid operation type" };
      }
    } catch (error) {
      console.error("Operation error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}
