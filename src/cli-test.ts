import { FileService } from "./services/fileService.js";
import { FileOperation } from "./types/index.js";

// 테스트용 설정
const testConfig = {
  allowedDirectories: [process.cwd()],
  allowedExtensions: ["txt", "ts", "js"],
};

const fileService = new FileService(testConfig);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const path = args[1];
  const content = args[2];

  console.log("\n=== FileService Test CLI ===");
  console.log("Command:", command);
  console.log("Path:", path);
  console.log("Content:", content);
  console.log("Config:", {
    allowedDirectories: testConfig.allowedDirectories,
    allowedExtensions: testConfig.allowedExtensions,
  });

  if (!command || !path) {
    console.log("\nUsage:");
    console.log("  read <path>              - Read file content");
    console.log("  write <path> <content>   - Write content to file");
    console.log("  list <path>              - List directory contents");
    console.log("  delete <path>            - Delete file");
    console.log("\nExample:");
    console.log("  npm run cli read ./test.txt");
    console.log('  npm run cli write ./test.txt "Hello, World!"');
    console.log("  npm run cli list ./");
    console.log("  npm run cli delete ./test.txt");
    process.exit(1);
  }

  const operation: FileOperation = {
    type: command as "read" | "write" | "list" | "delete",
    path,
    content,
  };

  try {
    console.log("\nExecuting operation:", operation);
    const result = await fileService.handleOperation(operation);

    if (result.success) {
      console.log("\n✅ Operation successful");
      if (result.data) {
        console.log("\nResult:");
        console.log(result.data);
      }
    } else {
      console.error("\n❌ Operation failed");
      console.error("Error:", result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Unexpected error");
    console.error("Error:", error);
    process.exit(1);
  }
}

// 테스트 실행
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
