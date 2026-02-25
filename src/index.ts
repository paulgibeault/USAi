#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "https://www.federalregister.gov/api/v1";

// --- Helpers ---

async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Federal Register API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function formatDocument(doc: any): string {
  const lines: string[] = [];
  lines.push(`**${doc.title}**`);
  if (doc.type) lines.push(`Type: ${doc.type}`);
  if (doc.document_number) lines.push(`Document #: ${doc.document_number}`);
  if (doc.publication_date) lines.push(`Published: ${doc.publication_date}`);
  if (doc.agencies?.length) {
    const names = doc.agencies.map((a: any) => a.name).join(", ");
    lines.push(`Agencies: ${names}`);
  }
  if (doc.abstract) lines.push(`\n${doc.abstract}`);
  if (doc.html_url) lines.push(`\nURL: ${doc.html_url}`);
  return lines.join("\n");
}

// --- Server ---

const server = new McpServer({
  name: "usai-federal-register",
  version: "0.1.0",
});

// Tool: Search the Federal Register
server.tool(
  "search_federal_register",
  "Search the Federal Register for documents (rules, proposed rules, notices, presidential documents, executive orders). Returns matching documents with title, type, date, agency, abstract, and URL.",
  {
    query: z.string().describe("Search terms"),
    document_type: z
      .enum(["RULE", "PRORULE", "NOTICE", "PRESDOCU"])
      .optional()
      .describe("Filter by type: RULE, PRORULE (proposed rule), NOTICE, PRESDOCU (presidential document)"),
    per_page: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe("Results per page (1-20, default 5)"),
  },
  async ({ query, document_type, per_page }) => {
    const params = new URLSearchParams({
      "conditions[term]": query,
      per_page: String(per_page),
      order: "relevance",
    });
    if (document_type) {
      params.set("conditions[type][]", document_type);
    }

    const data: any = await fetchJSON(`${BASE_URL}/documents.json?${params}`);

    if (!data.results?.length) {
      return { content: [{ type: "text", text: `No results found for "${query}".` }] };
    }

    const text = data.results.map(formatDocument).join("\n\n---\n\n");
    return {
      content: [
        {
          type: "text",
          text: `Found ${data.count} results (showing ${data.results.length}):\n\n${text}`,
        },
      ],
    };
  }
);

// Tool: Get a specific document by number
server.tool(
  "get_federal_register_document",
  "Retrieve a specific Federal Register document by its document number.",
  {
    document_number: z.string().describe("The document number (e.g. '2025-02145')"),
  },
  async ({ document_number }) => {
    const data: any = await fetchJSON(`${BASE_URL}/documents/${document_number}.json`);
    return {
      content: [{ type: "text", text: formatDocument(data) }],
    };
  }
);

// Tool: Get today's (or a specific date's) documents
server.tool(
  "get_federal_register_by_date",
  "Get Federal Register documents published on a specific date.",
  {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Date in YYYY-MM-DD format"),
    document_type: z
      .enum(["RULE", "PRORULE", "NOTICE", "PRESDOCU"])
      .optional()
      .describe("Filter by document type"),
  },
  async ({ date, document_type }) => {
    const params = new URLSearchParams({
      "conditions[publication_date][is]": date,
      per_page: "10",
    });
    if (document_type) {
      params.set("conditions[type][]", document_type);
    }

    const data: any = await fetchJSON(`${BASE_URL}/documents.json?${params}`);

    if (!data.results?.length) {
      return { content: [{ type: "text", text: `No documents found for ${date}.` }] };
    }

    const text = data.results.map(formatDocument).join("\n\n---\n\n");
    return {
      content: [
        {
          type: "text",
          text: `${data.count} documents published on ${date} (showing ${data.results.length}):\n\n${text}`,
        },
      ],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("USAi Federal Register MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
