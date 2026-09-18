# mcp-ieee-standards

IEEE Xplore MCP — BYOK wrapper over the IEEE Xplore Metadata Search API

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `ieee_standard_search` | Search IEEE STANDARDS by number or topic and get each standard's title, abstract/scope, publication year, DOI and IEEE Xplore link. Covers the IEEE standards catalogue: IEEE 802.11 Wi-Fi / wireless LAN, IEEE 802.3 Ethernet, IEEE 1588 PTP precision time protocol, IEEE 1547 distributed energy resource interconnection, IEEE 1149.1 JTAG boundary scan, IEEE 754 floating point, IEEE 802.1AS timing, and the rest. Answers "what does IEEE standard X cover", "which IEEE standard defines Y", "find the IEEE 802.3 ethernet spec", "latest revision of IEEE 1588". Returns metadata plus the abstract; the normative clause text is sold by IEEE, so follow html_url to purchase or access it. Requires your own free IEEE Xplore API key via _apiKey (register an app at developer.ieee.org). Example: ieee_standard_search({ query: "802.11 wireless LAN", limit: 5, _apiKey: "your-ieee-key" }). Example: ieee_standard_search({ query: "1588 precision time protocol", year: 2019, _apiKey: "your-ieee-key" }) |
| `ieee_search` | Search the FULL IEEE Xplore corpus — IEEE and IET journal articles, conference proceedings, magazines, books, courses and standards — returning title, authors, abstract, publication venue, year, DOI and the IEEE Xplore link. The broad engineering / computer-science research tool: IEEE paper search, engineering research paper lookup, conference proceedings search, literature review on a technical topic, tracking one author's IEEE publications. Set content_type to focus on a single kind of record ("Conferences", "Journals", "Standards", "Magazines", "Books", "Courses", "Early Access"), or omit it to search every type at once. Returns metadata plus the abstract; the full text is sold by IEEE, so follow html_url to purchase or read it under an institutional subscription. Requires your own free IEEE Xplore API key via _apiKey (register an app at developer.ieee.org). Example: ieee_search({ query: "federated learning edge devices", limit: 10, _apiKey: "your-ieee-key" }). Example: ieee_search({ query: "millimeter wave beamforming", content_type: "Conferences", year: 2024, _apiKey: "your-ieee-key" }) |
| `ieee_article` | Fetch one IEEE Xplore record by its article_number or DOI: full metadata including title, every author with affiliation, the complete abstract, publication venue, year, volume/issue, page range, publisher, IEEE and author index terms, plus standard_number and standard_status when the record is a standard, and the Xplore html_url / pdf_url. Use it to expand a hit from ieee_search or ieee_standard_search, or when an agent already holds an IEEE DOI or article number. Returns metadata plus the abstract; the full text is sold by IEEE — html_url is where to purchase or access it. Requires your own free IEEE Xplore API key via _apiKey (register an app at developer.ieee.org). Example: ieee_article({ article_number: "8766229", _apiKey: "your-ieee-key" }). Example: ieee_article({ doi: "10.1109/IEEESTD.2020.9363693", _apiKey: "your-ieee-key" }) |

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

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/ieee-standards/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Ieee Standards data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT

## No MCP client? Call it over HTTP

This pack takes your own API key (`_apiKey`) — we don't front one for it, so there's no curl here that would run without it. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/ieee_standard_search`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.
