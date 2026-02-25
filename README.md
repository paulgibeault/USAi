# USAi 🇺🇸

MCP server providing AI agents with access to US government APIs.

## APIs

### Federal Register (v1)
Search and retrieve documents from the [Federal Register](https://www.federalregister.gov/) — executive orders, rules, proposed rules, and notices. **No API key required.**

**Tools:**
- `search_federal_register` — Search by keyword, filter by document type
- `get_federal_register_document` — Get a specific document by number
- `get_federal_register_by_date` — Get all documents published on a date

### Congress.gov (v3)
Browse bills, look up members of Congress, and check roll call votes via [Congress.gov API](https://api.congress.gov/). Works with the free `DEMO_KEY` (rate limited) or your own key.

**Tools:**
- `list_bills` — List bills by congress/type, sorted by last updated
- `get_bill_details` — Full details on a specific bill (sponsors, policy area, actions)
- `search_members` — Look up members by state, congress, or chamber
- `get_recent_votes` — Recent House or Senate roll call votes

## Setup

```bash
npm install
npm run build
```

### Congress.gov API Key (optional)

The server uses `DEMO_KEY` by default (limited to ~40 requests/hour). For heavier use, get a free key at https://api.congress.gov/sign-up/ and set:

```bash
export CONGRESS_API_KEY=your_key_here
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

- [x] Federal Register API
- [x] Congress.gov API (bills, votes, members)
- [ ] USAspending.gov (federal spending/contracts)
- [ ] SEC EDGAR (company filings)
- [ ] Census Bureau (demographics)
- [ ] regulations.gov (public comments)

## License

MIT
