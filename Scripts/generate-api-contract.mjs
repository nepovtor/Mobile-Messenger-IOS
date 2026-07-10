import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contractPath = path.join(repositoryRoot, "contracts", "openapi.json");
const spec = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const operations = collectOperations(spec);
const outputs = new Map([
  [
    path.join(
      repositoryRoot,
      "web",
      "src",
      "shared",
      "api",
      "generated",
      "apiContract.ts",
    ),
    renderTypeScript(operations),
  ],
  [
    path.join(
      repositoryRoot,
      "MobileMessengerIOS",
      "Shared",
      "Network",
      "GeneratedAPIContract.swift",
    ),
    renderSwift(operations),
  ],
]);

verifyControllerCoverage(operations);

if (process.argv.includes("--check")) {
  const stale = [];
  for (const [outputPath, expected] of outputs) {
    const actual = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, "utf8")
      : "";
    if (actual !== expected) {
      stale.push(path.relative(repositoryRoot, outputPath));
    }
  }
  if (stale.length > 0) {
    console.error(
      `Generated API contract files are stale: ${stale.join(", ")}. Run: node Scripts/generate-api-contract.mjs`,
    );
    process.exit(1);
  }
  console.log(`OpenAPI contract is synchronized (${operations.length} operations).`);
  process.exit(0);
}

for (const [outputPath, content] of outputs) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
}
console.log(`Generated API clients for ${operations.length} operations.`);

function collectOperations(document) {
  const result = [];
  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "patch", "delete"]) {
      const operation = pathItem[method];
      if (!operation?.operationId) {
        continue;
      }
      result.push({ operationId: operation.operationId, method, route });
    }
  }
  return result.sort((left, right) =>
    left.operationId.localeCompare(right.operationId),
  );
}

function clientPath(route) {
  return route.replace(/^\/api(?=\/|$)/, "") || "/";
}

function renderTypeScript(items) {
  const entries = items
    .map(
      ({ operationId, route }) =>
        `  ${JSON.stringify(operationId)}: ${JSON.stringify(clientPath(route))},`,
    )
    .join("\n");
  return `// Generated from contracts/openapi.json. Do not edit manually.
export const apiOperations = {
${entries}
} as const;

export type APIOperation = keyof typeof apiOperations;

export function apiPath(
  operation: APIOperation,
  parameters: Record<string, string> = {},
): string {
  return apiOperations[operation].replace(
    /\\{([^}]+)\\}/g,
    (_, name: string) =>
      encodeURIComponent(parameters[name] ?? "{" + name + "}"),
  );
}
`;
}

function renderSwift(items) {
  const cases = items
    .map(({ operationId }) => `        case ${operationId}`)
    .join("\n");
  const switches = items
    .map(
      ({ operationId, route }) =>
        `        case .${operationId}: ${JSON.stringify(clientPath(route).replace(/^\//, ""))}`,
    )
    .join("\n");
  return `// Generated from contracts/openapi.json. Do not edit manually.
import Foundation

public enum GeneratedAPIContract {
    public enum Operation: String, CaseIterable {
${cases}
    }

    public static func path(
        _ operation: Operation,
        parameters: [String: String] = [:]
    ) -> String {
        let template = switch operation {
${switches}
        }
        return parameters.reduce(template) { result, entry in
            result.replacingOccurrences(
                of: "{\\(entry.key)}",
                with: entry.value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? entry.value
            )
        }
    }
}
`;
}

function verifyControllerCoverage(items) {
  const contractRoutes = new Set(
    items.map(({ method, route }) => `${method.toUpperCase()} ${route}`),
  );
  const modulesRoot = path.join(repositoryRoot, "server", "src", "modules");
  const controllerFiles = walk(modulesRoot).filter((file) =>
    file.endsWith(".controller.ts"),
  );
  const missing = [];

  for (const file of controllerFiles) {
    const source = fs.readFileSync(file, "utf8");
    const controller = source.match(/@Controller\((?:["']([^"']*)["'])?\)/);
    if (!controller) {
      continue;
    }
    const prefix = controller[1] ?? "";
    for (const match of source.matchAll(
      /@(Get|Post|Patch|Delete|Sse)\((?:["']([^"']*)["'])?\)/g,
    )) {
      const method = match[1] === "Sse" ? "GET" : match[1].toUpperCase();
      const suffix = match[2] ?? "";
      const joined = [prefix, suffix].filter(Boolean).join("/");
      const route = `/api${joined ? `/${joined}` : ""}`.replace(
        /:([A-Za-z0-9_]+)/g,
        "{$1}",
      );
      const key = `${method} ${route}`;
      if (!contractRoutes.has(key)) {
        missing.push(
          `${key} (${path.relative(repositoryRoot, file)})`,
        );
      }
    }
  }

  if (missing.length > 0) {
    console.error(
      `Backend routes missing from contracts/openapi.json:\n${missing.join("\n")}`,
    );
    process.exit(1);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}
