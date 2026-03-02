# /forge-tool — 12-Phase Tool Creation Dialogue

Create a new agent tool through a structured 12-phase dialogue. Each phase must complete before the next begins. Do not skip phases or collapse multiple phases into one response.

---

## Phase 0 — Explore

Ask open-ended questions to understand what the user wants the tool to do. Do not propose a name or schema yet. Listen for the core capability, the use case, and the data required. End with a clear problem statement that the tool will solve.

---

## Phase 1 — Skeptic Gate

Challenge the tool's necessity before proceeding. Ask:
- Does an existing tool already cover this? (Ask the user to list their current tools.)
- Is this tool actually needed by the LLM, or is it a pure UI feature?
- Is the scope too broad — should this be split into two tools?
- Is the scope too narrow — could this be a parameter on an existing tool?

If the tool clearly overlaps with an existing one, say so and ask how it differs. Only proceed when the tool passes the skeptic gate.

---

## Phase 2 — Description + Name

Lock the **routing contract** — the description is what the LLM reads to decide when to call this tool. It must be unambiguous.

1. Propose a snake_case tool name (e.g. `get_portfolio_value`)
2. Write a precise one-sentence description (≤ 120 chars, no hedging words like "might" or "can")
3. Ask the user to confirm both. Do not proceed until confirmed.

---

## Phase 3 — Collect Fields

Collect the tool's full specification:

| Field | What to ask |
|-------|-------------|
| `schema` | What parameters does the tool accept? (name, type, required/optional, description for each) |
| `category` | What category? (e.g. `portfolio`, `account`, `market`) |
| `consequenceLevel` | How serious is a wrong call? (`low` / `medium` / `high`) |
| `requiresConfirmation` | Should the HITL engine pause for user approval? (yes/no) |
| `timeout` | Max execution time in ms (default: 10000) |
| `tags` | Optional searchability tags |
| `triggerPhrases` | 3–5 example user phrases that should trigger this tool |

---

## Phase 4 — Routing

Collect the HTTP routing information:

| Field | What to ask |
|-------|-------------|
| `endpointTarget` | Full path template, e.g. `/api/portfolio/{userId}` |
| `httpMethod` | GET / POST / PUT / DELETE / PATCH |
| `authType` | How is the request authenticated? (`bearer` / `api-key` / `none`) |
| Parameter mapping | Which tool parameters map to path params vs. query params vs. body fields? |

---

## Phase 5 — Dependency Check

Ask: "What does the tool context (`ctx`) need to provide at runtime?" For each dependency (API client, DB connection, auth token, external service), verify the user's sidecar context object already provides it. Flag any gaps.

---

## Phase 6 — Confirm Full Spec

Present a complete summary of the spec as a formatted block (name, description, schema, routing, HITL config, dependencies). Ask the user to confirm before any code is written. Do not proceed without explicit approval.

---

## Phase 7 — Generate All Files

Generate the following files (show each in a separate code block, then write them):

1. **`tools/<name>.tool.js`** — ToolDefinition object with `name`, `description`, `schema`, `category`, `consequenceLevel`, `requiresConfirmation`, `timeout`, `tags`, `triggerPhrases`, `mcpRouting`, and a stub `execute()` for local testing
2. **`tools/<name>.tool.test.js`** — Vitest unit tests covering: schema validation, happy path execute(), error path, timeout behavior
3. **Register in barrel** — add an export line to `tools/index.js` (or create if absent)

---

## Phase 8 — Run Tests

Run `npm test` (or `vitest run`) and confirm all tests pass. If any test fails, fix the generated code and re-run. Do not proceed until green.

---

## Phase 9 — Generate Evals

Hand off to the `/forge-eval` skill: generate a golden eval suite (5–10 cases) and a labeled eval suite (2–3 multi-tool scenarios). Write to `evals/<name>.golden.json` and `evals/<name>.labeled.json`.

---

## Phase 10 — Generate Verifiers

Hand off to the `/forge-verifier` skill: generate a verifier stub for the new tool's output. Write to `verification/<name>.verifier.js` and register in `verification/index.js`.

---

## Phase 11 — Done

Print a summary of everything created:
- Tool file and test file paths
- Eval files created
- Verifier stub created
- Any warnings or follow-up items

Ask if the user wants to adjust anything before finishing.
