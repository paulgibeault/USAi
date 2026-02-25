# USAi 🇺🇸

MCP server providing AI agents with access to US government APIs.

## APIs

### Federal Register (v1)
Search and retrieve documents from the [Federal Register](https://www.federalregister.gov/) — executive orders, rules, proposed rules, and notices.

**Tools:**
- `search_federal_register` — Search by keyword, filter by document type
- `get_federal_register_document` — Get a specific document by number
- `get_federal_register_by_date` — Get all documents published on a date

No API key required.

## Setup

```bash
npm install
npm run build
```

## Usage (MCP)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "usai": {
      "command": "node",
      "args": ["/path/to/USAi/dist/index.js"]
    }
  }
}
```

## Roadmap

- [ ] Congress.gov API (bills, votes, members)
- [ ] USAspending.gov (federal spending/contracts)
- [ ] SEC EDGAR (company filings)
- [ ] Census Bureau (demographics)
- [ ] regulations.gov (public comments)

## License

MIT
