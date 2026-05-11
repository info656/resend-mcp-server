#!/usr/bin/env node

/**
 * Resend MCP Server
 * 
 * Full MCP server for Resend API
 * Supports: Emails, Templates, Broadcasts, Contacts, Segments, Domains, Logs
 * 
 * Usage:
 *   export RESEND_API_KEY=re_xxx
 *   node resend-mcp-server.js
 * 
 * Or in TypingMind MCP config:
 *   Command: node /path/to/resend-mcp-server.js
 *   Env: RESEND_API_KEY=re_xxx
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
const USER_AGENT = "resend-mcp-server/1.0";

// ─── API Helper ──────────────────────────────────────────────

async function resendRequest(method, path, body = null) {
  const url = `${RESEND_API_BASE}${path}`;
  const headers = {
    "Authorization": `Bearer ${RESEND_API_KEY}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

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
        from: { type: "string", description: "Sender email address. Use format: 'Name <email@domain.com>'" },
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
              filename: { type: "string", description: "Filename of the attachment" },
              content: { type: "string", description: "Base64-encoded content of the attachment" },
              path: { type: "string", description: "URL path to the attachment file" },
              contentType: { type: "string", description: "MIME type of the attachment" },
            }
          }
        },
        template: {
          type: "object",
          description: "Use a published template instead of html/text",
          properties: {
            id: { type: "string", description: "ID or alias of the published template" },
            variables: { type: "object", description: "Template variables as key/value pairs", additionalProperties: true }
          },
          required: ["id"]
        },
        headers: { type: "object", description: "Custom email headers", additionalProperties: { type: "string" } },
        tags: {
          type: "array",
          description: "Custom tags for the email",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Tag name (letters, numbers, underscores, dashes)" },
              value: { type: "string", description: "Tag value (letters, numbers, underscores, dashes)" }
            },
            required: ["name", "value"]
          }
        },
        topicId: { type: "string", description: "Topic ID for subscription management" }
      }
    }
  },
  {
    name: "get_email",
    description: "Retrieve details of a sent email by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The email ID" }
      }
    }
  },
  {
    name: "list_emails",
    description: "List all sent emails with optional pagination",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of emails to return (default 20, max 100)" },
        after: { type: "string", description: "Pagination cursor - get results after this ID" },
        before: { type: "string", description: "Pagination cursor - get results before this ID" }
      }
    }
  },
  {
    name: "cancel_email",
    description: "Cancel a scheduled email by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The email ID to cancel" }
      }
    }
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
        alias: { type: "string", description: "Optional alias for the template" },
        from: { type: "string", description: "Default sender email (can be overridden when sending)" },
        subject: { type: "string", description: "Default subject line (can be overridden when sending)" },
        replyTo: { type: "string", description: "Default reply-to address" },
        text: { type: "string", description: "Plain text version" },
        variables: {
          type: "array",
          description: "Variables used in the template (max 50)",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Variable name (e.g. PRODUCT_NAME). Cannot be: FIRST_NAME, LAST_NAME, EMAIL, RESEND_UNSUBSCRIBE_URL" },
              type: { type: "string", enum: ["string", "number"], description: "Variable type" },
              fallbackValue: { type: "string", description: "Default value if not provided when sending" }
            },
            required: ["key", "type"]
          }
        }
      }
    }
  },
  {
    name: "list_templates",
    description: "List all email templates with their status (draft/published)",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of templates (default 20, max 100)" },
        after: { type: "string", description: "Pagination cursor" },
        before: { type: "string", description: "Pagination cursor" }
      }
    }
  },
  {
    name: "get_template",
    description: "Get details of a specific template by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The template ID" }
      }
    }
  },
  {
    name: "update_template",
    description: "Update an existing template",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The template ID to update" },
        name: { type: "string", description: "New template name" },
        html: { type: "string", description: "New HTML content" },
        alias: { type: "string", description: "New alias" },
        from: { type: "string", description: "New default sender" },
        subject: { type: "string", description: "New default subject" },
        replyTo: { type: "string", description: "New default reply-to" },
        text: { type: "string", description: "New plain text version" },
        variables: {
          type: "array",
          description: "Updated variables",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              type: { type: "string", enum: ["string", "number"] },
              fallbackValue: { type: "string" }
            },
            required: ["key", "type"]
          }
        }
      }
    }
  },
  {
    name: "delete_template",
    description: "Delete a template permanently",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The template ID to delete" }
      }
    }
  },
  {
    name: "publish_template",
    description: "Publish a draft template so it can be used when sending emails",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The template ID to publish" }
      }
    }
  },
  {
    name: "duplicate_template",
    description: "Duplicate an existing template",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The template ID to duplicate" },
        name: { type: "string", description: "New name for the duplicated template" }
      }
    }
  },

  // ─── BROADCASTS ───
  {
    name: "create_broadcast",
    description: "Create a broadcast (newsletter) to send to a segment of contacts",
    inputSchema: {
      type: "object",
      required: ["segmentId", "from", "subject"],
      properties: {
        segmentId: { type: "string", description: "The ID of the segment/audience to send to" },
        from: { type: "string", description: "Sender email address" },
        subject: { type: "string", description: "Email subject" },
        html: { type: "string", description: "HTML content. Use {{{contact.first_name}}} for personalization" },
        text: { type: "string", description: "Plain text version" },
        replyTo: { type: "string", description: "Reply-to address" },
        name: { type: "string", description: "Friendly name for internal reference" },
        topicId: { type: "string", description: "Topic ID to scope the broadcast" },
        send: { type: "boolean", description: "Send immediately after creation (default: false)" },
        scheduledAt: { type: "string", description: "Schedule sending (requires send: true). Natural language or ISO 8601" }
      }
    }
  },
  {
    name: "send_broadcast",
    description: "Send a draft broadcast by ID",
    inputSchema: {
      type: "object",
      required: ["broadcastId"],
      properties: {
        broadcastId: { type: "string", description: "The broadcast ID to send" },
        scheduledAt: { type: "string", description: "Optional schedule time (natural language or ISO 8601)" }
      }
    }
  },
  {
    name: "list_broadcasts",
    description: "List all broadcasts",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of broadcasts (default 20, max 100)" },
        after: { type: "string", description: "Pagination cursor" },
        before: { type: "string", description: "Pagination cursor" }
      }
    }
  },
  {
    name: "get_broadcast",
    description: "Get details of a specific broadcast",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The broadcast ID" }
      }
    }
  },
  {
    name: "update_broadcast",
    description: "Update a broadcast",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The broadcast ID to update" },
        from: { type: "string" },
        subject: { type: "string" },
        html: { type: "string" },
        text: { type: "string" },
        replyTo: { type: "string" },
        name: { type: "string" },
        segmentId: { type: "string" },
        topicId: { type: "string" }
      }
    }
  },
  {
    name: "delete_broadcast",
    description: "Delete a broadcast",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The broadcast ID to delete" }
      }
    }
  },

  // ─── CONTACTS ───
  {
    name: "create_contact",
    description: "Create a new contact in a segment",
    inputSchema: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", description: "Contact email address" },
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        unsubscribed: { type: "boolean", description: "Set to true if contact is unsubscribed" },
        segmentId: { type: "string", description: "Optional: add to a specific segment" },
        properties: { type: "object", description: "Custom properties as key/value pairs", additionalProperties: { type: "string" } }
      }
    }
  },
  {
    name: "list_contacts",
    description: "List all contacts with optional filtering",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of contacts (default 20, max 100)" },
        after: { type: "string", description: "Pagination cursor" },
        before: { type: "string", description: "Pagination cursor" },
        segmentId: { type: "string", description: "Filter by segment ID" }
      }
    }
  },
  {
    name: "get_contact",
    description: "Get details of a specific contact by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The contact ID" }
      }
    }
  },
  {
    name: "update_contact",
    description: "Update a contact's information",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The contact ID to update" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        unsubscribed: { type: "boolean" },
        properties: { type: "object", additionalProperties: { type: "string" } }
      }
    }
  },
  {
    name: "delete_contact",
    description: "Delete a contact permanently",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The contact ID to delete" }
      }
    }
  },

  // ─── SEGMENTS ───
  {
    name: "list_segments",
    description: "List all segments (formerly audiences)",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "create_segment",
    description: "Create a new segment (formerly audience)",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Segment name" }
      }
    }
  },

  // ─── DOMAINS ───
  {
    name: "list_domains",
    description: "List all verified and pending domains",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },

  // ─── LOGS ───
  {
    name: "list_logs",
    description: "List email delivery logs",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of logs (default 20, max 100)" },
        after: { type: "string", description: "Pagination cursor" },
        before: { type: "string", description: "Pagination cursor" }
      }
    }
  }
];

// ─── Tool Handler ────────────────────────────────────────────

const server = new Server(
  { name: "resend-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS
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
          topic_id: args.topicId
        });
        break;

      case "get_email":
        result = await resendRequest("GET", `/emails/${args.id}`);
        break;

      case "list_emails": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", args.limit);
        if (args?.after) params.set("after", args.after);
        if (args?.before) params.set("before", args.before);
        const qs = params.toString();
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
          variables: args.variables
        });
        break;

      case "list_templates": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", args.limit);
        if (args?.after) params.set("after", args.after);
        if (args?.before) params.set("before", args.before);
        const qs = params.toString();
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
          variables: args.variables
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
          name: args.name
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
          scheduled_at: args.scheduledAt
        });
        break;

      case "send_broadcast":
        result = await resendRequest("POST", `/broadcasts/${args.broadcastId}/send`, {
          scheduled_at: args.scheduledAt
        });
        break;

      case "list_broadcasts": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", args.limit);
        if (args?.after) params.set("after", args.after);
        if (args?.before) params.set("before", args.before);
        const qs = params.toString();
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
          topic_id: args.topicId
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
          properties: args.properties
        });
        break;

      case "list_contacts": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", args.limit);
        if (args?.after) params.set("after", args.after);
        if (args?.before) params.set("before", args.before);
        if (args?.segmentId) params.set("segment_id", args.segmentId);
        const qs = params.toString();
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
          properties: args.properties
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
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", args.limit);
        if (args?.after) params.set("after", args.after);
        if (args?.before) params.set("before", args.before);
        const qs = params.toString();
        result = await resendRequest("GET", `/logs${qs ? "?" + qs : ""}`);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error: ${error.message}`
      }]
    };
  }
});

// ─── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ Resend MCP Server is running!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
