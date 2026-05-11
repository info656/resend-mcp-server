# Resend MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Resend API](https://resend.com).

Lets AI agents (like TypingMind, Claude, etc.) send emails, manage templates, broadcasts, contacts, and more via Resend.

## Available Tools

### 📧 Emails
- `send_email` - Send an email (HTML, text, attachments, templates, scheduling)
- `get_email` - Get details of a sent email
- `list_emails` - List sent emails
- `cancel_email` - Cancel a scheduled email

### 🎨 Templates
- `create_template` - Create a new template
- `list_templates` - List all templates
- `get_template` - Get template details
- `update_template` - Update a template
- `delete_template` - Delete a template
- `publish_template` - Publish a draft template
- `duplicate_template` - Duplicate a template

### 📬 Broadcasts
- `create_broadcast` - Create a broadcast (newsletter)
- `send_broadcast` - Send a draft broadcast
- `list_broadcasts` - List all broadcasts
- `get_broadcast` - Get broadcast details
- `update_broadcast` - Update a broadcast
- `delete_broadcast` - Delete a broadcast

### 👥 Contacts
- `create_contact` - Create a contact
- `list_contacts` - List contacts
- `get_contact` - Get contact details
- `update_contact` - Update a contact
- `delete_contact` - Delete a contact

### 📋 Segments
- `list_segments` - List all segments
- `create_segment` - Create a new segment

### 🌐 Domains
- `list_domains` - List all domains

### 📊 Logs
- `list_logs` - List email delivery logs

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- A Resend API key ([get one here](https://resend.com/api-keys))

### Local Setup

```bash
# Clone or download
mkdir resend-mcp-server && cd resend-mcp-server

# Save the files (package.json + resend-mcp-server.js)

# Install dependencies
npm install

# Set your API key
set RESEND_API_KEY=re_xxx  # Windows
# or
export RESEND_API_KEY=re_xxx  # macOS/Linux

# Run the server
node resend-mcp-server.js
```

## Connecting to TypingMind

1. Go to **Settings → MCP Servers → Add Server**
2. Fill in:
   | Field | Value |
   |-------|-------|
   | **Name** | `Resend Email API` |
   | **Type** | `command` (nebo `stdio`) |
   | **Command** | `node` |
   | **Args** | `C:/cesta/k/resend-mcp-server.js` (full path) |
   | **Env** | `RESEND_API_KEY=re_xxx` |
3. Click **Save**

Now your AI agent can use all Resend tools!

## Usage Examples

> "Send a welcome email to john@example.com"
> "Create a new template called 'weekly-newsletter' with this HTML..."
> "Show me all my email templates"
> "Create a broadcast and send it to segment XYZ"
> "List all contacts in my database"
> "Add a new contact with email info@company.com"

## License
MIT
