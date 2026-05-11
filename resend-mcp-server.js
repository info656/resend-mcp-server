import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Žádný dotenv! Railway si klíč vezme rovnou z Variables.
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

// ─── DEFINICE TVÝCH 26 NÁSTROJŮ ──────────────────────────────
const TOOLS = [
  {
    name: "send_email",
    description: "Send an email via Resend. Supports HTML, plain text, attachments, templates, scheduling, and more.",
    inputSchema: {
      type: "object",
      required: ["from", "to", "subject"],
      properties: {
        from: { type: "string" },
        to: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        html: { type: "string" },
        text: { type: "string" },
        replyTo: { type: "string" },
        scheduledAt: { type: "string" },
        template: {
          type: "object",
          properties: { id: { type: "string" }, variables: { type: "object", additionalProperties: true } },
          required: ["id"],
        },
      },
    },
  },
  { name: "get_email", description: "Retrieve details of a sent email by ID", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "list_emails", description: "List all sent emails", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "cancel_email", description: "Cancel a scheduled email", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  {
    name: "create_template",
    description: "Create a new email template",
    inputSchema: {
      type: "object",
      required: ["name", "html"],
      properties: { name: { type: "string" }, html: { type: "string" }, subject: { type: "string" } },
    },
  },
  { name: "list_templates", description: "List all email templates", inputSchema: { type: "object", properties: {} } },
  { name: "get_template", description: "Get details of a specific template", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "publish_template", description: "Publish a draft template", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "create_broadcast", description: "Create a broadcast", inputSchema: { type: "object", required: ["segmentId", "from", "subject"], properties: { segmentId: { type: "string" }, from: { type: "string" }, subject: { type: "string" }, html: { type: "string" } } } },
  { name: "list_broadcasts", description: "List all broadcasts", inputSchema: { type: "object", properties: {} } },
  { name: "list_contacts", description: "List contacts", inputSchema: { type: "object", properties: { segmentId: { type: "string" } } } },
  { name: "create_contact", description: "Create contact", inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" }, firstName: { type: "string" }, segmentId: { type: "string" } } } },
  { name: "list_segments", description: "List segments", inputSchema: { type: "object", properties: {} } },
  { name: "list_domains", description: "List domains", inputSchema: { type: "object", properties: {} } },
  { name: "list_logs", description: "List delivery logs", inputSchema: { type: "object", properties: {} } }
];

// ─── MCP SERVER (BEZPEČNÝ INSTANČNÍ MODEL) ───────────────────
function createNewMcpServer() {
  const server = new Server({ name: "resend-mcp-server", version: "2.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case "send_email":
          result = await resendRequest("POST", "/emails", {
            from: args.from, to: Array.isArray(args.to) ? args.to : [args.to], subject: args.subject,
            html: args.html, text: args.text, reply_to: args.replyTo, scheduled_at: args.scheduledAt, template: args.template
          });
          break;
        case "get_email": result = await resendRequest("GET", `/emails/${args.id}`); break;
        case "list_emails": result = await resendRequest("GET", `/emails`); break;
        case "cancel_email": result = await resendRequest("POST", `/emails/${args.id}/cancel`); break;
        case "create_template": result = await resendRequest("POST", "/templates", { name: args.name, html: args.html, subject: args.subject }); break;
        case "list_templates": result = await resendRequest("GET", `/templates`); break;
        case "get_template": result = await resendRequest("GET", `/templates/${args.id}`); break;
        case "publish_template": result = await resendRequest("POST", `/templates/${args.id}/publish`); break;
        case "create_broadcast": result = await resendRequest("POST", "/broadcasts", { segment_id: args.segmentId, from: args.from, subject: args.subject, html: args.html }); break;
        case "list_broadcasts": result = await resendRequest("GET", `/broadcasts`); break;
        case "list_contacts": result = await resendRequest("GET", args.segmentId ? `/contacts?segment_id=${args.segmentId}` : `/contacts`); break;
        case "create_contact": result = await resendRequest("POST", "/contacts", { email: args.email, first_name: args.firstName, segment_id: args.segmentId }); break;
        case "list_segments": result = await resendRequest("GET", "/segments"); break;
        case "list_domains": result = await resendRequest("GET", "/domains"); break;
        case "list_logs": result = await resendRequest("GET", "/logs"); break;
        default: throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
    }
  });

  return server;
}

// ─── WEBOVÝ SERVER PRO SSE ───────────────────────────────────
const app = express();

// POZOR: Povolíme CORS, ale NENÍ TU express.json()
app.use(cors());

const transports = new Map();

// Zde TypingMind zahajuje spojení
app.get("/sse", async (req, res) => {
  console.log("✅ Nové GET připojení k SSE");
  try {
    const server = createNewMcpServer();
    const transport = new SSEServerTransport("/message", res);
    await server.connect(transport);
    transports.set(transport.sessionId, transport);
    
    req.on("close", () => {
      transports.delete(transport.sessionId);
    });
  } catch (err) {
    res.status(500).send("Chyba inicializace SSE");
  }
});

// Zde TypingMind posílá samotné příkazy
app.post("/message", async (req, res) => {
  console.log("📩 Zpráva na /message");
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) return res.status(404).send("Session nenalezena.");
  
  await transport.handlePostMessage(req, res);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", transport: "SSE", tools: TOOLS.length });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Resend MCP Server běží na portu ${PORT} (SSE Endpoint: /sse)`);
});
