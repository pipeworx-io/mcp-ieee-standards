# mcp-ieee-standards

IEEE Xplore MCP — BYOK wrapper over the IEEE Xplore Metadata Search API

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1351+ live data sources.

## Tools

| Tool | Description |
|------|-------------|

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "ieee-standards": {
      "url": "https://gateway.pipeworx.io/ieee-standards/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1351+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Ieee Standards data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [All tools and guides](https://github.com/pipeworx-io/examples)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
