# /forge-mcp — Generate MCP Server Scaffold

Generate a Model Context Protocol (MCP) server scaffold from one or more ToolDefinition objects. The generated server can be registered with any MCP-compatible client (Claude, Cursor, etc.).

---

## Step 1 — Identify Tools to Expose

Ask the user which tools to expose via MCP, or default to all tools in `tools/index.js`.

For each tool, read its ToolDefinition to extract:
- `name`, `description`, `schema` (parameters)
- `mcpRouting` (HTTP endpoint and method)

---

## Step 2 — Generate MCP Server

Generate `mcp-server.js` (or the user's preferred filename) using `@modelcontextprotocol/sdk`:

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
```

The server must:
1. Implement `tools/list` — return all tools with their JSON schemas
2. Implement `tools/call` — route to the correct ToolDefinition's `mcpRouting` HTTP endpoint
3. Handle auth headers from environment (`FORGE_API_KEY` or tool-specific env vars)
4. Return structured errors on tool failure

---

## Step 3 — Generate Transport Config

Generate a `mcp.json` config snippet the user can paste into their Claude Desktop or Cursor config:

```json
{
  "mcpServers": {
    "<project-name>": {
      "command": "node",
      "args": ["./mcp-server.js"],
      "env": {
        "API_BASE_URL": "http://localhost:3000",
        "FORGE_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

---

## Step 4 — Summary

Print:
- MCP server file path
- Number of tools exposed
- Config snippet location
- Instructions for registering with the MCP client
