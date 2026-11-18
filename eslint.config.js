import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import ts from "typescript-eslint";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const NAMED_IMPORTS = {
  react: "react",
  "react-dom": "react",
  three: "three",
  "@react-three/fiber": "three",
  "@react-three/drei": "three",
  prisma: "prisma",
  "@prisma/client": "prisma",
  fs: "fs",
  "node:fs": "fs",
  net: "net",
  "node:net": "net",
};

function packageName(source) {
  if (source.startsWith("@")) return source.split("/").slice(0, 2).join("/");
  return source.split("/")[0];
}

function namedBan(source) {
  const bare = packageName(source);
  if (NAMED_IMPORTS[bare]) return NAMED_IMPORTS[bare];
  if (source.startsWith("node:fs")) return "fs";
  if (source.startsWith("node:net")) return "net";
  return null;
}

function isInside(filename, packageDir) {
  const root = path.resolve(repoRoot, packageDir);
  const relative = path.relative(root, filename);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function relativeEscapes(filename, source, packageDir) {
  if (!source.startsWith(".")) return false;
  const root = path.resolve(repoRoot, packageDir);
  const resolved = path.resolve(path.dirname(filename), source);
  const relative = path.relative(root, resolved);
  return (
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  );
}

function memberName(node) {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return null;
}

const boundaryRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce living-pets package boundaries and sim nondeterminism bans.",
    },
    schema: [
      {
        type: "object",
        properties: {
          packageDir: { type: "string" },
          allowPackages: { type: "array", items: { type: "string" } },
          banNondeterminism: { type: "boolean" },
        },
        required: ["packageDir"],
        additionalProperties: false,
      },
    ],
    messages: {
      mathRandom: "Forbidden in packages/sim: Math.random",
      dateNow: "Forbidden in packages/sim: Date.now",
      namedImport:
        "Forbidden in {{packageDir}}: {{label}} (import '{{source}}')",
      packageImport:
        "{{packageDir}} may import only {{allowed}} (found '{{source}}')",
      escape:
        "{{packageDir}} may not import files outside itself (found '{{source}}')",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const packageDir = options.packageDir;
    const allowPackages = options.allowPackages ?? [];
    const banNondeterminism = options.banNondeterminism === true;
    const allowedText =
      allowPackages.length > 0
        ? `relative files inside the package and ${allowPackages.join(", ")}`
        : "relative files inside the package";

    function checkSource(node, source) {
      if (typeof source !== "string" || !packageDir) return;
      const filename = context.filename ?? context.getFilename();
      if (source.startsWith(".")) {
        if (filename && isInside(filename, packageDir)) {
          if (relativeEscapes(filename, source, packageDir)) {
            context.report({
              node,
              messageId: "escape",
              data: { packageDir, source },
            });
          }
        }
        return;
      }
      const allowed = allowPackages.some(
        (name) => source === name || source.startsWith(`${name}/`),
      );
      if (allowed) return;
      const label = namedBan(source);
      if (label) {
        context.report({
          node,
          messageId: "namedImport",
          data: { packageDir, label, source },
        });
        return;
      }
      context.report({
        node,
        messageId: "packageImport",
        data: { packageDir, allowed: allowedText, source },
      });
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node.source, node.source.value);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") {
          checkSource(node.source, node.source.value);
        }
      },
      TSImportType(node) {
        if (node.argument.type === "Literal") {
          checkSource(node.argument, node.argument.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0] &&
          node.arguments[0].type === "Literal"
        ) {
          checkSource(node.arguments[0], node.arguments[0].value);
        }
      },
      MemberExpression(node) {
        if (!banNondeterminism || node.object.type !== "Identifier") return;
        const name = memberName(node);
        if (node.object.name === "Math" && name === "random") {
          context.report({ node, messageId: "mathRandom" });
        }
        if (node.object.name === "Date" && name === "now") {
          context.report({ node, messageId: "dateNow" });
        }
      },
    };
  },
};

const livingPets = { rules: { boundaries: boundaryRule } };

export default ts.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["packages/contract/**/*.{ts,tsx}"],
    plugins: { "living-pets": livingPets },
    rules: {
      "living-pets/boundaries": [
        "error",
        { packageDir: "packages/contract", allowPackages: [] },
      ],
    },
  },
  {
    files: ["packages/sim/**/*.{ts,tsx}"],
    plugins: { "living-pets": livingPets },
    rules: {
      "living-pets/boundaries": [
        "error",
        {
          packageDir: "packages/sim",
          allowPackages: ["@boing-pets/contract"],
          banNondeterminism: true,
        },
      ],
    },
  },
  {
    files: ["packages/db/**/*.{ts,tsx}"],
    plugins: { "living-pets": livingPets },
    rules: {
      "living-pets/boundaries": [
        "error",
        {
          packageDir: "packages/db",
          allowPackages: ["@boing-pets/contract", "@prisma/client"],
        },
      ],
    },
  },
  {
    files: ["packages/sim/test/**/*.ts"],
    plugins: { "living-pets": livingPets },
    rules: {
      "living-pets/boundaries": [
        "error",
        {
          packageDir: "packages/sim",
          allowPackages: [
            "@boing-pets/contract",
            "node:test",
            "node:assert",
            "node:crypto",
          ],
          banNondeterminism: true,
        },
      ],
    },
  },
  {
    files: ["packages/db/test/**/*.ts"],
    plugins: { "living-pets": livingPets },
    rules: {
      "living-pets/boundaries": [
        "error",
        {
          packageDir: "packages/db",
          allowPackages: [
            "@boing-pets/contract",
            "@prisma/client",
            "node:test",
            "node:assert",
            "node:fs",
            "node:path",
            "node:url",
          ],
        },
      ],
    },
  },
  {
    files: ["apps/sim-host/**/*.{ts,tsx}"],
    plugins: { "living-pets": livingPets },
    rules: {
      "living-pets/boundaries": [
        "error",
        {
          packageDir: "apps/sim-host",
          allowPackages: [
            "@boing-pets/contract",
            "@boing-pets/db",
            "@boing-pets/sim",
          ],
        },
      ],
    },
  },
  {
    files: ["apps/sim-host/test/**/*.ts"],
    plugins: { "living-pets": livingPets },
    rules: {
      "living-pets/boundaries": [
        "error",
        {
          packageDir: "apps/sim-host",
          allowPackages: [
            "@boing-pets/contract",
            "@boing-pets/db",
            "@boing-pets/sim",
            "node:test",
            "node:assert",
          ],
        },
      ],
    },
  },
  {
    files: ["packages/db/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
);
