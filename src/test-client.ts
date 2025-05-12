import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import path from "path"; // Import path for resolving cwd

async function testMCPServer() {
  try {
    // 클라이언트 생성
    const client = new Client({
      name: "test-client",
      version: "1.0.0",
    });

    // --- 가상 설정 정의 (원래는 외부 파일이나 설정에서 읽어옴) ---
    const serverConfig = {
      // 사용자가 제공한 예시와 유사하게 구성
      command: "node", // 실행할 명령어
      script: "dist/server.js", // 실행할 스크립트
      directories: [
        // 허용할 디렉토리 (테스트용으로 process.cwd() 사용)
        path.resolve(process.cwd(), "test-resources"), // test-resources 디렉토리 생성 가정
        path.resolve(process.cwd(), "test-prompts"), // test-prompts 디렉토리 생성 가정
      ],
      extensions: [".txt", ".json", ".md"], // 허용할 확장자
    };

    // 서버 시작을 위한 args 배열 구성
    const serverArgs = [
      serverConfig.script,
      ...serverConfig.directories,
      "--extensions",
      serverConfig.extensions.join(","),
    ];
    // ----------------------------------------------------------

    // Stdio 전송 계층 생성 및 연결 (수정됨)
    const transport = new StdioClientTransport({
      command: serverConfig.command, // "node"
      args: serverArgs, // 구성된 인수 배열 사용
    });
    await client.connect(transport);

    // *** server/config 호출 제거 ***
    // console.log("\n=== Configuring Server ===");
    // await client.request(
    //   {
    //     method: "server/config",
    //     params: {
    //       config: {
    //         allowedDirectories: [process.cwd()], // Provide appropriate directories
    //         allowedExtensions: ["txt", "pdf", "docx", "xlsx", "pptx", "json"], // Provide appropriate extensions
    //       },
    //     },
    //   },
    //   z.object({ success: z.boolean() })
    // );
    // console.log("Server configured successfully.");
    // ******************************

    // 1. 서버 정보 조회
    console.log("\n=== Testing Server Info ===");
    const infoResponse = await client.request(
      {
        method: "server/info",
      },
      z.object({
        name: z.string(),
        version: z.string(),
      })
    );
    console.log("Server Info:", infoResponse);

    // 2. 가용한 도구 목록 조회
    console.log("\n=== Testing Available Tools ===");
    const toolsResponse = await client.request(
      {
        method: "tools/list",
      },
      z.object({
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
          })
        ),
      })
    );
    console.log("Available Tools:", toolsResponse);

    // 3. 도구 실행 테스트
    console.log("\n=== Testing Tool Execution ===");
    const writeResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "writeFile",
          arguments: {
            path: "test.txt",
            content: "Hello from MCP Client!",
          },
        },
      },
      z.object({
        content: z.array(
          z.object({
            type: z.string(),
            text: z.string(),
          })
        ),
      })
    );
    console.log("Write Result:", writeResult);

    const readResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "readFile",
          arguments: {
            path: "test.txt",
          },
        },
      },
      z.object({
        content: z.array(
          z.object({
            type: z.string(),
            text: z.string(),
          })
        ),
      })
    );
    console.log("Read Result:", readResult);

    // 4. 리소스 목록 조회
    console.log("\n=== Testing Resources ===");
    const resourcesResponse = await client.request(
      {
        method: "resources/list",
      },
      z.object({
        resources: z.array(
          z.object({
            name: z.string(),
            uri: z.string(),
          })
        ),
      })
    );
    console.log("\nAvailable Resources:");
    if (resourcesResponse.resources.length > 0) {
      resourcesResponse.resources.forEach((resource) => {
        console.log(`  - Name: ${resource.name}, URI: ${resource.uri}`);
      });
    } else {
      console.log("  No resources found.");
    }
    // console.log('Resources:', resourcesResponse); // Keep original log if needed for debugging

    // 5. 사용 가능한 프롬프트 목록 조회
    console.log("\n=== Testing Available Prompts ===");
    const promptsResponse = await client.request(
      {
        method: "prompts/list",
      },
      z.object({
        prompts: z.array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            arguments: z
              .array(
                z.object({
                  name: z.string(),
                  description: z.string().optional(),
                  required: z.boolean().optional(),
                })
              )
              .optional(),
          })
        ),
        nextCursor: z.string().optional(),
      })
    );
    console.log("Available Prompts:", promptsResponse);

    // 6. 특정 프롬프트 처리 테스트 (today-weather 사용)
    console.log("\n=== Testing Prompt Get (today-weather) ===");
    const selectedPromptName = "today-weather"; // Example: Select the weather prompt
    const promptArgs = { city: "Seoul" }; // Example: Provide required argument

    const promptResult = await client.request(
      {
        method: "prompts/get", // Use standard method name
        params: {
          name: selectedPromptName,
          arguments: promptArgs, // Pass arguments according to schema
        },
      },
      // Update Zod schema to match GetPromptResult
      z.object({
        description: z.string().optional(),
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.array(
              z
                .object({
                  type: z.string(),
                  text: z.string().optional(), // text might not always be present
                  // Add other content types if needed (image, audio, resource)
                })
                .passthrough()
            ), // Allow other properties in content items
          })
        ),
      })
    );
    console.log(
      "Prompt Result (today-weather):",
      JSON.stringify(promptResult, null, 2)
    );
  } catch (error) {
    console.error("Error:", error);
  }
}

// 테스트 실행
testMCPServer().catch(console.error);
