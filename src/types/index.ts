export interface FileOperation {
  type: "read" | "write" | "list" | "delete" | "createDirectory";
  path: string;
  content?: string;
}

export interface FileResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface FileConfig {
  allowedDirectories: string[];
  allowedExtensions: string[];
}
