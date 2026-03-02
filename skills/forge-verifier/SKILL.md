# /forge-verifier — Detect Missing Verifiers and Generate Stubs

Scan the tool registry for tools without verifier coverage, then generate verifier stubs for each gap.

---

## Step 1 — Scan for Gaps

Read `tools/index.js` to list all registered tools.
Read `verification/index.js` (or `verifiers/index.js`) to list all registered verifiers.

A verifier gap exists when a tool name has no corresponding verifier registration.

Print a gap table:
| Tool | Has Verifier? |
|------|--------------|
| get_portfolio_value | ✗ MISSING |
| list_accounts | ✓ |

If no gaps, print "All tools have verifier coverage." and stop.

---

## Step 2 — Confirm Which to Generate

List the tools with missing verifiers. Ask the user which ones to generate stubs for (default: all).

---

## Step 3 — Generate Verifier Stubs

For each selected tool, generate `verification/<name>.verifier.js`:

```js
/**
 * Verifier for <tool_name>.
 * Called after every tool execution with (args, result).
 * Return: { outcome: 'pass'|'warn'|'block', message: string|null }
 */
export const <camelCaseName>Verifier = {
  name: '<name>_verifier',
  // Tools this verifier applies to ('*' for all tools)
  tools: ['<tool_name>'],

  async verify(args, result) {
    // TODO: implement verification logic
    // Common checks:
    //   - result.status === 200 (HTTP success)
    //   - required fields present in result.body
    //   - no negative values for financial amounts
    //   - data freshness (timestamp within acceptable window)

    if (result.error) {
      return { outcome: 'warn', message: `Tool returned error: ${result.error}` };
    }
    return { outcome: 'pass', message: null };
  }
};
```

---

## Step 4 — Register Verifiers

Add export lines to `verification/index.js` (create if absent):

```js
export { <camelCaseName>Verifier } from './<name>.verifier.js';
```

---

## Step 5 — Summary

Print:
- N verifier stubs created
- File paths written
- Reminder: replace the TODO with actual verification logic before shipping
