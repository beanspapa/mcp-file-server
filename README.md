# MCP 파일 서버 (MCP File Server)

MCP 파일 서버는 Model Context Protocol(MCP) 표준을 기반으로, 파일 시스템에 대한 **안전하고 제어된 접근**을 제공하는 TypeScript 기반 서버 구현 예시입니다. LLM(거대 언어 모델)이나 자동화된 에이전트가 서버 환경의 파일 시스템과 상호작용해야 할 때, 보안 위험 없이 필요한 파일 작업(읽기, 쓰기, 목록 조회 등)을 수행할 수 있도록 설계되었습니다.

주요 목적은 클라이언트(또는 LLM)가 서버에 미리 정의된 규칙(허용된 디렉토리, 허용된 파일 확장자) 내에서만 파일 시스템에 접근하도록 강제하여 보안을 유지하는 것입니다.

## 주요 기능

- **안전한 파일 작업**: 지정된 `allowedDirectories` 내의, `allowedExtensions` 확장자를 가진 파일에 대해서만 읽기, 쓰기, 삭제 작업을 허용합니다. **Path Traversal 공격을 방지**하는 로직이 포함되어 있습니다.
- **디렉토리 목록 조회**: 허용된 경로 내의 파일 및 하위 디렉토리 목록을 안전하게 조회합니다.
- **설정 기반 접근 제어**: 서버 시작 시 클라이언트로부터 전달받는 `allowedDirectories`, `allowedExtensions` 설정을 통해 파일 접근 범위를 동적으로 제한합니다.
- **MCP 표준 프로토콜 지원**: MCP (`tools/list`, `resources/list`, `prompts/list` 등) 표준 인터페이스를 통해 도구, 리소스, 프롬프트 기능을 제공하여 클라이언트와의 상호작용을 표준화합니다.
- **CLI 테스트 도구**: 서버의 핵심 파일 접근 로직(`FileService`)을 MCP 프로토콜 없이 직접 테스트해볼 수 있는 간단한 명령줄 인터페이스(CLI)를 제공합니다.

## 핵심 아키텍처

이 서버는 다음과 같은 주요 구성 요소로 이루어져 있습니다:

- **`src/server.ts`**: MCP 서버의 메인 진입점입니다. 클라이언트 요청을 수신하고, 적절한 Manager에게 작업을 위임하며, MCP 요청 핸들러를 등록합니다.
- **Managers (`src/managers/`)**: 각 핵심 기능을 관리합니다.
  - `ToolManager`: 사용 가능한 도구(`file-reader` 등) 목록 관리 및 실행을 담당합니다. (`tools/list` 등 처리)
  - `ResourceManager`: 파일 기반 리소스(예: `file://` URI) 목록 조회 및 접근 유효성 검증을 담당합니다. (`resources/list` 등 처리)
  - `PromptManager`: 프롬프트 템플릿 관리 및 조회를 담당합니다. (`prompts/list`, `prompts/get` 등 처리)
- **`src/fileService.ts`**: **모든 파일 시스템 접근 로직을 담당하는 핵심 보안 구성 요소**입니다. 다른 어떤 컴포넌트(Manager, Tool 등)도 직접 `fs` 모듈을 사용해서는 안 되며, 반드시 `FileService`를 통해야 합니다. `FileService`는 내부적으로 경로 검증(Path Traversal 방지), 허용 디렉토리 및 확장자 검사를 수행합니다.
- **Tools (`src/tools/`)**: 실제 작업을 수행하는 도구 구현체입니다. (예: `FileReaderTool`)

**중요: 초기화 순서**

1.  서버는 시작 후 클라이언트로부터 **`server/config`** 요청을 통해 `allowedDirectories`, `allowedExtensions` 등의 설정을 받아야 합니다.
2.  이 설정값을 기반으로 `FileService` 및 각 `Manager` (Tool, Resource, Prompt)가 **초기화**됩니다.
3.  Manager들이 성공적으로 초기화된 **후에** 관련 MCP 요청 핸들러(예: `tools/list`, `resources/list`, 개별 도구 핸들러 등)가 등록됩니다.

## 설치

```bash
npm install
```

## 실행

### MCP 서버 실행

```bash
# 개발 모드로 실행 (변경사항 자동 감지)
npm run dev
```

- 서버는 MCP 프로토콜을 통해 클라이언트와 통신합니다.
- **주의**: 서버가 정상적으로 동작하려면, 클라이언트는 서버 연결 후 가장 먼저 `server/config` 요청을 보내 `allowedDirectories`와 `allowedExtensions`를 설정해야 합니다. 이 설정 없이는 `FileService`가 초기화되지 않아 대부분의 기능이 작동하지 않습니다.

### CLI 테스트 도구

CLI 테스트 도구는 `FileService`의 기능을 MCP 서버 없이 직접 테스트하기 위해 제공됩니다. **이 CLI를 사용하기 전에는, 테스트하려는 경로와 파일이 해당 CLI 코드 내에 하드코딩된 `allowedDirectories` 및 `allowedExtensions` 설정과 일치하는지 확인해야 합니다.** (실제 서버와는 별개의 설정일 수 있습니다.)

```bash
# CLI 사용법 (Windows 경로 예시)
npm run cli <명령어> <경로> ["내용"]

# 사용 가능한 명령어:
npm run cli read <파일경로>              # 파일 읽기
npm run cli write <파일경로> "<내용>"    # 파일 쓰기 (내용은 큰따옴표로 감싸세요)
npm run cli list <디렉토리경로>          # 디렉토리 목록
npm run cli delete <파일경로>            # 파일 삭제
npm run cli createDir <디렉토리경로>     # 디렉토리 생성

# 예시 (경로는 실제 테스트 환경에 맞게 수정 필요):
npm run cli read C:\\Users\\User\\Desktop\\mcp-test\\data.txt
npm run cli write C:\\Users\\User\\Desktop\\mcp-test\\new_data.txt "새로운 파일 내용입니다."
npm run cli list C:\\Users\\User\\Desktop\\mcp-test
npm run cli delete C:\\Users\\User\\Desktop\\mcp-test\\obsolete.txt
npm run cli createDir C:\\Users\\User\\Desktop\\mcp-test\\new_folder
```

## MCP 클라이언트 상호작용 예시 (개념)

실제 MCP 클라이언트는 다음과 같은 요청을 서버에 보낼 수 있습니다:

```json
// 서버 설정 요청
{
  "jsonrpc": "2.0",
  "method": "server/config",
  "params": {
    "allowedDirectories": ["/path/to/workspace"],
    "allowedExtensions": [".txt", ".md"]
  }
}

// 도구 목록 요청
{ "jsonrpc": "2.0", "method": "tools/list", "params": {} }

// 파일 읽기 도구 실행 요청
{
  "jsonrpc": "2.0",
  "method": "file-reader", // ToolManager에 등록된 도구 이름
  "params": {
    "path": "documents/report.txt" // allowedDirectories 기준 상대 경로
  }
}
```

## 설정 (`server/config` 파라미터)

클라이언트가 `server/config` 요청 시 `params`에 포함해야 하는 설정입니다.

```json
{
  "allowedDirectories": ["/home/user/projects/safe-zone", "/var/data/shared"],
  "allowedExtensions": [
    ".txt",
    ".json",
    ".md",
    ".csv"
    // 필요한 확장자 명시 (점(.) 포함)
  ]
}
```

- `allowedDirectories`: 서버가 파일 작업을 수행할 수 있는 최상위 디렉토리 목록입니다. **반드시 절대 경로**로 지정해야 합니다.
- `allowedExtensions`: 접근을 허용할 파일 확장자 목록입니다. **반드시 점(.)으로 시작**해야 합니다. (예: `.txt`)

## 타입 정의 (주요 타입)

- **`FileOperationParams` (예: `file-reader` 도구 입력)**: `path: string` 등 도구별 파라미터.
- **`FileServiceConfig`**: `{ allowedDirectories: string[]; allowedExtensions: string[]; }`
- **`McpError`**: MCP 표준 오류 객체 (`code`, `message`, `data?`).

(자세한 MCP 요청/응답 타입은 `@mcp/sdk` 등 관련 SDK 문서를 참조하세요.)

## 폴더 구조

- `src/`: 소스 코드 루트
  - `server.ts`: MCP 서버 메인 파일
  - `cli-test.ts`: CLI 테스트 도구 구현
  - `fileService.ts`: 핵심 파일 시스템 접근 및 보안 로직
  - `managers/`: 기능별 관리자 클래스 (`ToolManager`, `ResourceManager`, `PromptManager`)
  - `tools/`: 개별 도구 구현체 (`FileReaderTool` 등)
  - `prompts/`: 프롬프트 템플릿 파일 (예시)
  - `resources/`: 리소스 파일 (예시)
  - `types/`: 프로젝트 내 커스텀 타입 정의
- `dist/`: TypeScript 컴파일 결과 (JavaScript)
- `node_modules/`: 의존성 패키지
- `tsconfig.json`: TypeScript 컴파일 설정
- `package.json`: 프로젝트 정보 및 의존성 관리
- `README.md`: 프로젝트 설명 (이 파일)

## 라이선스

ISC
