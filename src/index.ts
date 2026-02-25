#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const FR_BASE = "https://www.federalregister.gov/api/v1";
const CONGRESS_BASE = "https://api.congress.gov/v3";
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || "DEMO_KEY";

// --- Helpers ---

async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText} — ${url}`);
  }
  return res.json();
}

function congressURL(path: string, params: Record<string, string> = {}): string {
  const p = new URLSearchParams({ format: "json", api_key: CONGRESS_API_KEY, ...params });
  return `${CONGRESS_BASE}${path}?${p}`;
}

// --- Formatters ---

function formatFRDocument(doc: any): string {
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

function formatBill(bill: any): string {
  const lines: string[] = [];
  lines.push(`**${bill.title}**`);
  lines.push(`Type: ${bill.type} ${bill.number} | Congress: ${bill.congress}`);
  lines.push(`Chamber: ${bill.originChamber}`);
  if (bill.latestAction) {
    lines.push(`Latest Action (${bill.latestAction.actionDate}): ${bill.latestAction.text}`);
  }
  if (bill.url) lines.push(`API URL: ${bill.url}`);
  return lines.join("\n");
}

function formatMember(member: any): string {
  const lines: string[] = [];
  const name = member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim();
  lines.push(`**${name}**`);
  if (member.partyName) lines.push(`Party: ${member.partyName}`);
  if (member.state) lines.push(`State: ${member.state}`);
  if (member.district) lines.push(`District: ${member.district}`);
  if (member.chamber) lines.push(`Chamber: ${member.chamber}`);
  if (member.terms?.item?.length) {
    const latest = member.terms.item[member.terms.item.length - 1];
    if (latest) lines.push(`Term: ${latest.startYear}–${latest.endYear || "present"}`);
  }
  if (member.url) lines.push(`API URL: ${member.url}`);
  return lines.join("\n");
}

// --- Server ---

const server = new McpServer({
  name: "usai",
  version: "0.2.0",
});

// ==================
// FEDERAL REGISTER
// ==================

server.tool(
  "search_federal_register",
  "Search the Federal Register for documents (rules, proposed rules, notices, presidential documents, executive orders).",
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

    const data: any = await fetchJSON(`${FR_BASE}/documents.json?${params}`);

    if (!data.results?.length) {
      return { content: [{ type: "text", text: `No results found for "${query}".` }] };
    }

    const text = data.results.map(formatFRDocument).join("\n\n---\n\n");
    return {
      content: [{ type: "text", text: `Found ${data.count} results (showing ${data.results.length}):\n\n${text}` }],
    };
  }
);

server.tool(
  "get_federal_register_document",
  "Retrieve a specific Federal Register document by its document number.",
  {
    document_number: z.string().describe("The document number (e.g. '2025-02145')"),
  },
  async ({ document_number }) => {
    const data: any = await fetchJSON(`${FR_BASE}/documents/${document_number}.json`);
    return { content: [{ type: "text", text: formatFRDocument(data) }] };
  }
);

server.tool(
  "get_federal_register_by_date",
  "Get Federal Register documents published on a specific date.",
  {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date in YYYY-MM-DD format"),
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

    const data: any = await fetchJSON(`${FR_BASE}/documents.json?${params}`);

    if (!data.results?.length) {
      return { content: [{ type: "text", text: `No documents found for ${date}.` }] };
    }

    const text = data.results.map(formatFRDocument).join("\n\n---\n\n");
    return {
      content: [{ type: "text", text: `${data.count} documents published on ${date} (showing ${data.results.length}):\n\n${text}` }],
    };
  }
);

// ==================
// CONGRESS.GOV
// ==================

server.tool(
  "list_bills",
  "List bills in the US Congress, sorted by most recently updated. Browse by congress number and/or bill type. Note: Congress.gov API does not support keyword search — use specific congress/type filters to find relevant bills.",
  {
    congress: z.number().default(119).describe("Congress number (e.g. 119 for 2025-2026)"),
    bill_type: z
      .enum(["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"])
      .optional()
      .describe("Bill type: hr (House), s (Senate), hjres/sjres (Joint Res.), hconres/sconres (Concurrent Res.), hres/sres (Simple Res.)"),
    limit: z.number().min(1).max(20).default(5).describe("Number of results (1-20, default 5)"),
    sort: z.enum(["updateDate+desc", "updateDate+asc"]).default("updateDate+desc").describe("Sort order"),
  },
  async ({ congress, bill_type, limit, sort }) => {
    let path = `/bill/${congress}`;
    if (bill_type) path += `/${bill_type}`;

    const params: Record<string, string> = { limit: String(limit), sort };
    const url = congressURL(path, params);

    const data: any = await fetchJSON(url);
    const bills = data.bills || [];

    if (!bills.length) {
      return { content: [{ type: "text", text: "No bills found." }] };
    }

    const text = bills.map(formatBill).join("\n\n---\n\n");
    const total = data.pagination?.count ? ` (${data.pagination.count} total)` : "";
    return {
      content: [{ type: "text", text: `Bills${total}:\n\n${text}` }],
    };
  }
);

server.tool(
  "get_bill_details",
  "Get detailed information about a specific bill, including sponsors, cosponsors, subjects, and actions.",
  {
    congress: z.number().describe("Congress number (e.g. 119)"),
    bill_type: z
      .enum(["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"])
      .describe("Bill type"),
    bill_number: z.number().describe("Bill number"),
  },
  async ({ congress, bill_type, bill_number }) => {
    const bill: any = await fetchJSON(congressURL(`/bill/${congress}/${bill_type}/${bill_number}`));
    const b = bill.bill;
    if (!b) {
      return { content: [{ type: "text", text: "Bill not found." }] };
    }

    const lines: string[] = [];
    lines.push(`**${b.title}**`);
    lines.push(`${b.type} ${b.number} | Congress: ${b.congress}`);
    if (b.introducedDate) lines.push(`Introduced: ${b.introducedDate}`);
    if (b.originChamber) lines.push(`Origin: ${b.originChamber}`);
    if (b.sponsors?.length) {
      lines.push(`Sponsors: ${b.sponsors.map((s: any) => `${s.fullName} (${s.party}-${s.state})`).join(", ")}`);
    }
    if (b.cosponsors) lines.push(`Cosponsors: ${b.cosponsors}`);
    if (b.policyArea?.name) lines.push(`Policy Area: ${b.policyArea.name}`);
    if (b.latestAction) {
      lines.push(`Latest Action (${b.latestAction.actionDate}): ${b.latestAction.text}`);
    }
    if (b.textVersions?.url) lines.push(`Full Text: ${b.textVersions.url}`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "search_members",
  "Search for current and past members of Congress.",
  {
    state: z.string().length(2).optional().describe("Two-letter state code (e.g. ID, CA)"),
    congress: z.number().optional().describe("Congress number"),
    chamber: z.enum(["house", "senate"]).optional().describe("Chamber filter"),
    limit: z.number().min(1).max(20).default(10).describe("Number of results"),
  },
  async ({ state, congress, chamber, limit }) => {
    let path = "/member";
    if (congress) path += `/congress/${congress}`;
    if (state) path = `/member/${state.toUpperCase()}`;

    const params: Record<string, string> = { limit: String(limit) };
    const data: any = await fetchJSON(congressURL(path, params));
    const members = data.members || [];

    if (!members.length) {
      return { content: [{ type: "text", text: "No members found." }] };
    }

    let filtered = members;
    if (chamber) {
      filtered = members.filter((m: any) =>
        (m.terms?.item || []).some((t: any) => t.chamber?.toLowerCase() === chamber)
      );
      if (!filtered.length) filtered = members; // fallback
    }

    const text = filtered.map(formatMember).join("\n\n---\n\n");
    return {
      content: [{ type: "text", text: `Members of Congress:\n\n${text}` }],
    };
  }
);

server.tool(
  "get_recent_votes",
  "Get recent roll call votes from the House or Senate.",
  {
    chamber: z.enum(["house", "senate"]).describe("Chamber"),
    congress: z.number().default(119).describe("Congress number (default: 119 for 2025-2026)"),
    limit: z.number().min(1).max(20).default(5).describe("Number of votes to return"),
  },
  async ({ chamber, congress, limit }) => {
    const data: any = await fetchJSON(
      congressURL(`/${chamber}-vote/${congress}`, { limit: String(limit) })
    );
    const votes = data.houseRollCallVotes || data.senateRollCallVotes || [];

    if (!votes.length) {
      return { content: [{ type: "text", text: `No recent votes found for ${chamber}.` }] };
    }

    const text = votes
      .map((v: any) => {
        const lines: string[] = [];
        lines.push(`**Roll Call #${v.rollCallNumber}** (${v.startDate || v.date || ""})`);
        if (v.legislationType && v.legislationNumber) lines.push(`Legislation: ${v.legislationType} ${v.legislationNumber}`);
        if (v.question) lines.push(`Question: ${v.question}`);
        if (v.voteType) lines.push(`Vote Type: ${v.voteType}`);
        if (v.result) lines.push(`Result: ${v.result}`);
        if (v.description) lines.push(`${v.description}`);
        if (v.legislationUrl) lines.push(`Bill: ${v.legislationUrl}`);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    return {
      content: [{ type: "text", text: `Recent ${chamber} votes:\n\n${text}` }],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("USAi MCP server running on stdio (Federal Register + Congress.gov)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
