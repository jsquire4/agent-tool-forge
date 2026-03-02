# /forge-eval — Generate Eval Suites

Generate golden and labeled eval JSON files for a named tool. Run this skill after a tool is implemented and tests are green.

---

## Step 1 — Identify the Tool

Ask the user which tool to generate evals for, or read it from context if `/forge-tool` just completed.

Read the tool's ToolDefinition from `tools/<name>.tool.js`:
- `name`, `description`, `schema`, `triggerPhrases`, `category`, `consequenceLevel`

---

## Step 2 — Generate Golden Eval Suite

Generate **5–10 golden cases** covering:
- Happy path with typical inputs
- Edge cases: empty results, boundary values, missing optional params
- Error paths: invalid input, service unavailable

Each golden case follows this schema:
```json
{
  "id": "case-001",
  "description": "What this case tests",
  "input": { "message": "User's natural-language request" },
  "expectedTool": "<tool_name>",
  "expectedArgs": { "param": "value" },
  "checks": [
    { "type": "tool_called", "tool": "<tool_name>" },
    { "type": "arg_equals", "arg": "param", "value": "value" }
  ]
}
```

Write to `evals/<name>.golden.json` as a JSON array.

---

## Step 3 — Generate Labeled Eval Suite

Generate **2–3 labeled (multi-tool) scenarios** where the agent must choose between 2+ tools or sequence multiple calls:
- Scenario where the tool is the correct choice over a similar tool
- Scenario where the tool is called followed by a second tool
- Scenario where the tool should NOT be called (wrong intent)

Each labeled case:
```json
{
  "id": "labeled-001",
  "description": "What this scenario tests",
  "input": { "message": "User's multi-intent request" },
  "label": "correct" | "incorrect" | "partial",
  "expectedTools": ["<tool_name>"],
  "checks": [...]
}
```

Write to `evals/<name>.labeled.json` as a JSON array.

---

## Step 4 — Validate

Run `node lib/index.js run --eval evals/<name>.golden.json --dry-run` if available to validate JSON schema.

Print a summary: N golden cases, M labeled scenarios, file paths written.
