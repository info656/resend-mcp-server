#!/usr/bin/env node

/**
 * Resend MCP Server
 *
 * Full MCP server for Resend API
 * Supports: Emails, Templates, Broadcasts, Contacts, Segments, Domains, Logs
 *
 * TWO MODES:
 * 1. LOCAL: node resend-mcp-server.js → stdio (for local Typemind MCP)
 * 2. CLOUD: PORT=3000 node resend-mcp-server.js → Streamable HTTP server (for URL connection)
 *
 * Env: RESEND_API_KEY=re_xxx
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ─── Configuration ───────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY environment variable is required");
  process.exit(1);
}

const RESEND_API_BASE = "https://api.resend.com";
const USER_AGENT = "resend-mcp-server/2.0";

// ─── API Helper ──────────────────────────────────────────────

async function resendRequest(method, path, body = null) {
  const url = `${RESEND_API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Resend API error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

// ─── Tool Definitions ────────────────────────────────────────

const TOOLS = [
  // ─── EMAILS ───
  {
    name: "send_email",
    description: "Send an email via Resend. Supports HTML, plain text, attachments, templates, scheduling, and more.",
    inputSchema: {
      type: "object",
      required: ["from", "to", "subject"],
      properties: {
        from: { type: "string", description: "Sender email address. Use format: 'Name <email>'" },
        to: { type: "array", items: { type: "string" }, description: "Recipient email addresses (max 50)" },
        subject: { type: "string", description: "Email subject line" },
        html: { type: "string", description: "HTML content of the email" },
        text: { type: "string", description: "Plain text version (auto-generated from HTML if omitted)" },
        bcc: { type: "array", items: { type: "string" }, description: "BCC recipients" },
        cc: { type: "array", items: { type: "string" }, description: "CC recipients" },
        replyTo: { type: "string", description: "Reply-to email address" },
        scheduledAt: { type: "string", description: "Schedule for later. Natural language (e.g. 'in 1 hour') or ISO 8601" },
        attachments: {
          type: "array",
          description: "Email attachments (max 40MB total)",
          items: {
            type: "object",
            properties: {
              filename: { type: "string" },
              content: { type: "string", description: "Base64-encoded content" },
              path: { type: "string", description: "URL path to the file" },
              contentType: { type: "string" },
            },
          },
        },
        template: {
          type: "object",
          description: "Use a published template instead of html/text",
          properties: {
            id: { type: "string", description: "ID or alias of the published template" },
            variables: { type: "object", description: "Template variables as key/value pairs", additionalProperties: true },
          },
          required: ["id"],
        },
        headers: { type: "object", description: "Custom email headers", additionalProperties: { type: "string" } },
        tags: {
          type: "array",
          description: "Custom tags for the email",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
            },
            required: ["name", "value"],
          },
        },
        topicId: { type: "string", description: "Topic ID for subscription management" },
      },
    },
  },
  {
    name: "get_email",
    description: "Retrieve details of a sent email by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "The email ID" } },
    },
  },
  {
    name: "list_emails",
    description: "List all sent emails with optional pagination",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of emails (default 20, max 100)" },
        after: { type: "string", description: "Pagination cursor" },
        before: { type: "string", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "cancel_email",
    description: "Cancel a scheduled email by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "The email ID to cancel" } },
    },
  },

  // ─── TEMPLATES ───
  {
    name: "create_template",
    description: "Create a new email template with optional variables. Must be published before use.",
    inputSchema: {
      type: "object",
      required: ["name", "html"],
      properties: {
        name: { type: "string", description: "Template name (e.g. 'order-confirmation')" },
        html: { type: "string", description: "HTML content. Use {{{VARIABLE_NAME}}} for variables" },
        alias: { type: "string" },
        from: { type: "string", description: "Default sender" },
        subject: { type: "string", description: "Default subject" },
        replyTo: { type: "string" },
        text: { type: "string" },
        variables: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              type: { type: "string", enum: ["string", "number"] },
              fallbackValue: { type: "string" },
            },
            required: ["key", "type"],
          },
        },
      },
    },
  },
  {
    name: "list_templates",
    description: "List all email templates with their status (draft/published)",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        after: { type: "string" },
        before: { type: "string" },
      },
    },
  },
  {
    name: "get_template",
    description: "Get details of a specific template by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "update_template",
    description: "Update an existing template",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        html: { type: "string" },
        alias: { type: "string" },
        from: { type: "string" },
        subject: { type: "string" },
        replyTo: { type: "string" },
        text: { type: "string" },
        variables: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "delete_template",
    description: "Delete a template permanently",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "publish_template",
    description: "Publish a draft template so it can be used when sending emails",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "duplicate_template",
    description: "Duplicate an existing template",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string", description: "New name for the duplicated template" },
      },
    },
  },

  // ─── BROADCASTS ───
  {
    name: "create_broadcast",
    description: "Create a broadcast (newsletter) to send to a segment of contacts",
    inputSchema: {
      type: "object",
      required: ["segmentId", "from", "subject"],
      properties: {
        segmentId: { type: "string", description: "The ID of the segment to send to" },
        from: { type: "string" },
        subject: { type: "string" },
        html: { type: "string" },
        text: { type: "string" },
        replyTo: { type: "string" },
        name: { type: "string" },
        topicId: { type: "string" },
        send: { type: "boolean", description: "Send immediately (default: false)" },
        scheduledAt: { type: "string" },
      },
    },
  },
  {
    name: "send_broadcast",
    description: "Send a draft broadcast by ID",
    inputSchema: {
      type: "object",
      required: ["broadcastId"],
      properties: {
        broadcastId: { type: "string" },
        scheduledAt: { type: "string" },
      },
    },
  },
  {
    name: "list_broadcasts",
    description: "List all broadcasts",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        after: { type: "string" },
        before: { type: "string" },
      },
    },
  },
  {
    name: "get_broadcast",
    description: "Get details of a specific broadcast",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "update_broadcast",
    description: "Update a broadcast",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        from: { type: "string" },
        subject: { type: "string" },
        html: { type: "string" },
        text: { type: "string" },
        replyTo: { type: "string" },
        name: { type: "string" },
        segmentId: { type: "string" },
        topicId: { type: "string" },
      },
    },
  },
  {
    name: "delete_broadcast",
    description: "Delete a broadcast",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },

  // ─── CONTACTS ───
  {
    name: "create_contact",
    description: "Create a new contact",
    inputSchema: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        unsubscribed: { type: "boolean" },
        segmentId: { type: "string" },
      },
    },
  },
  {
    name: "list_contacts",
    description: "List all contacts",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        after: { type: "string" },
        before: { type: "string" },
        segmentId: { type: "string" },
      },
    },
  },
  {
    name: "get_contact",
    description: "Get details of a specific contact by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "update_contact",
    description: "Update a contact's information",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        unsubscribed: { type: "boolean" },
      },
    },
  },
  {
    name: "delete_contact",
    description: "Delete a contact permanently",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },

  // ─── SEGMENTS ───
  {
    name: "list_segments",
    description: "List all segments (formerly audiences)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_segment",
    description: "Create a new segment (formerly audience)",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    },
  },

  // ─── DOMAINS ───
  {
    name: "list_domains",
    description: "List all verified and pending domains",
    inputSchema: { type: "object", properties: {} },
  },

  // ─── LOGS ───
  {
    name: "list_logs",
    description: "List email delivery logs",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        after: { type: "string" },
        before: { type: "string" },
      },
    },
  },
];

// ─── Create MCP Server ───────────────────────────────────────

const server = new Server(
  { name: "resend-mcp-server", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      // ── Emails ──
      case "send_email":
        result = await resendRequest("POST", "/emails", {
          from: args.from,
          to: Array.isArray(args.to) ? args.to : [args.to],
          subject: args.subject,
          html: args.html,
          text: args.text,
          bcc: args.bcc,
          cc: args.cc,
          reply_to: args.replyTo,
          scheduled_at: args.scheduledAt,
          attachments: args.attachments,
          template: args.template,
          headers: args.headers,
          tags: args.tags,
          topic_id: args.topicId,
        });
        break;

      case "get_email":
        result = await resendRequest("GET", `/emails/${args.id}`);
        break;

      case "list_emails": {
        const p = new URLSearchParams();
        if (args?.limit) p.set("limit", args.limit);
        if (args?.after) p.set("after", args.after);
        if (args?.before) p.set("before", args.before);
        const qs = p.toString();
        result = await resendRequest("GET", `/emails${qs ? "?" + qs : ""}`);
        break;
      }

      case "cancel_email":
        result = await resendRequest("POST", `/emails/${args.id}/cancel`);
        break;

      // ── Templates ──
      case "create_template":
        result = await resendRequest("POST", "/templates", {
          name: args.name,
          html: args.html,
          alias: args.alias,
          from: args.from,
          subject: args.subject,
          reply_to: args.replyTo,
          text: args.text,
          variables: args.variables,
        });
        break;

      case "list_templates": {
        const p = new URLSearchParams();
        if (args?.limit) p.set("limit", args.limit);
        if (args?.after) p.set("after", args.after);
        if (args?.before) p.set("before", args.before);
        const qs = p.toString();
        result = await resendRequest("GET", `/templates${qs ? "?" + qs : ""}`);
        break;
      }

      case "get_template":
        result = await resendRequest("GET", `/templates/${args.id}`);
        break;

      case "update_template":
        result = await resendRequest("PATCH", `/templates/${args.id}`, {
          name: args.name,
          html: args.html,
          alias: args.alias,
          from: args.from,
          subject: args.subject,
          reply_to: args.replyTo,
          text: args.text,
          variables: args.variables,
        });
        break;

      case "delete_template":
        result = await resendRequest("DELETE", `/templates/${args.id}`);
        break;

      case "publish_template":
        result = await resendRequest("POST", `/templates/${args.id}/publish`);
        break;

      case "duplicate_template":
        result = await resendRequest("POST", `/templates/${args.id}/duplicate`, {
          name: args.name,
        });
        break;

      // ── Broadcasts ──
      case "create_broadcast":
        result = await resendRequest("POST", "/broadcasts", {
          segment_id: args.segmentId,
          from: args.from,
          subject: args.subject,
          html: args.html,
          text: args.text,
          reply_to: args.replyTo,
          name: args.name,
          topic_id: args.topicId,
          send: args.send,
          scheduled_at: args.scheduledAt,
        });
        break;

      case "send_broadcast":
        result = await resendRequest("POST", `/broadcasts/${args.broadcastId}/send`, {
          scheduled_at: args.scheduledAt,
        });
        break;

      case "list_broadcasts": {
        const p = new URLSearchParams();
        if (args?.limit) p.set("limit", args.limit);
        if (args?.after) p.set("after", args.after);
        if (args?.before) p.set("before", args.before);
        const qs = p.toString();
        result = await resendRequest("GET", `/broadcasts${qs ? "?" + qs : ""}`);
        break;
      }

      case "get_broadcast":
        result = await resendRequest("GET", `/broadcasts/${args.id}`);
        break;

      case "update_broadcast":
        result = await resendRequest("PATCH", `/broadcasts/${args.id}`, {
          from: args.from,
          subject: args.subject,
          html: args.html,
          text: args.text,
          reply_to: args.replyTo,
          name: args.name,
          segment_id: args.segmentId,
          topic_id: args.topicId,
        });
        break;

      case "delete_broadcast":
        result = await resendRequest("DELETE", `/broadcasts/${args.id}`);
        break;

      // ── Contacts ──
      case "create_contact":
        result = await resendRequest("POST", "/contacts", {
          email: args.email,
          first_name: args.firstName,
          last_name: args.lastName,
          unsubscribed: args.unsubscribed,
          segment_id: args.segmentId,
        });
        break;

      case "list_contacts": {
        const p = new URLSearchParams();
        if (args?.limit) p.set("limit", args.limit);
        if (args?.after) p.set("after", args.after);
        if (args?.before) p.set("before", args.before);
        if (args?.segmentId) p.set("segment_id", args.segmentId);
        const qs = p.toString();
        result = await resendRequest("GET", `/contacts${qs ? "?" + qs : ""}`);
        break;
      }

      case "get_contact":
        result = await resendRequest("GET", `/contacts/${args.id}`);
        break;

      case "update_contact":
        result = await resendRequest("PATCH", `/contacts/${args.id}`, {
          first_name: args.firstName,
          last_name: args.lastName,
          unsubscribed: args.unsubscribed,
        });
        break;

      case "delete_contact":
        result = await resendRequest("DELETE", `/contacts/${args.id}`);
        break;

      // ── Segments ──
      case "list_segments":
        result = await resendRequest("GET", "/segments");
        break;

      case "create_segment":
        result = await resendRequest("POST", "/segments", { name: args.name });
        break;

      // ── Domains ──
      case "list_domains":
        result = await resendRequest("GET", "/domains");
        break;

      // ── Logs ──
      case "list_logs": {
        const p = new URLSearchParams();
        if (args?.limit) p.set("limit", args.limit);
        if (args?.after) p.set("after", args.after);
        if (args?.before) p.set("before", args.before);
        const qs = p.toString();
        result = await resendRequest("GET", `/logs${qs ? "?" + qs : ""}`);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
});

// ─── Start Server ────────────────────────────────────────────

async function main() {
  const PORT = process.env.PORT;

  if (PORT) {
    // ── CLOUD MODE: Streamable HTTP Server (pro Railway a Typemind) ──
    const express = (await import("express")).default;
    const cors = (await import("cors")).default;

    const app = express();
    
    app.use(cors());
    app.use(express.json());

    const transport = new StreamableHTTPServerTransport();

    // Propojení s MCP serverem
    server.connect(transport).catch(err => console.error("Chyba připojení serveru:", err));

    // 1. HEALTH CHECK (Tohle nám chybělo!)
    app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        tools: 26,
        transport: "streamable-http"
      });
    });

    // 2. HLAVNÍ MCP ENDPOINT PRO TYPEMIND
    app.all("/mcp", async (req, res) => {
      console.log(`[MCP] Zaznamenán ${req.method} požadavek od Typemindu`);
      try {
        await transport.handleRequest(req, res);
      } catch (err) {
        console.error("[MCP] Vnitřní chyba transportu:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Interní chyba MCP serveru", details: err.message });
        }
      }
    });

    app.listen(PORT, () => {
      console.log(`🚀 Resend MCP Server běží na portu ${PORT} (Streamable HTTP endpoint: /mcp)`);
    });

  } else {
    // ── LOCAL MODE: Stdio (pro testování na lokálním PC) ──
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🚀 Resend MCP Server běží lokálně (stdio)");
  }
}

// Spuštění aplikace
main().catch((error) => {
  console.error("Kritická chyba při startu:", error);
  process.exit(1);
});
