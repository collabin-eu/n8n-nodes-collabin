# n8n-nodes-collabin

This is an n8n community node package for [Collabin](https://collabin.eu), a multi-tenant leave management (HR) platform.

It lets you manage leave requests, users, teams and the workday calendar via the Collabin REST API, and react in real time to leave events via webhooks — directly from your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## What's included

| Item | Type | Description |
|---|---|---|
| **Collabin** | Action node | CRUD/read access to Users, Teams, Leave Types, Leaves and the Calendar via `/v1`. Also usable as a tool by AI Agent nodes. |
| **Collabin Trigger** | Trigger node | Starts a workflow when Collabin sends a webhook (`leave.created`, `leave.status_changed`), with built-in `X-Collabin-Signature` verification. |
| **Collabin API** | Credentials | Stores your API key and base URL, used by the **Collabin** node. |

## Installation

Follow the n8n community nodes [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/):

1. In n8n, go to **Settings → Community Nodes → Install**.
2. Enter `n8n-nodes-collabin`.
3. Confirm the installation.

## Credentials (Collabin API)

The **Collabin** node authenticates with an **API key**, sent as the `X-API-Key` header on every request.

### Getting an API key

1. In the Collabin dashboard, go to **Settings → API Keys**.
2. Create a new key with **Read** or **Read & Write** permission, depending on which operations you'll use (see the [Operations](#operations) table below).
3. Copy the key (`clb_...`) immediately — it is shown only once and cannot be retrieved again.

> **Plan requirement:** the external REST API (`/v1`) is available on the **Pro** plan, or can be enabled individually for an account by a Superadmin. Calling the API on an ineligible plan returns `403 Forbidden`.

### Setting up the credential in n8n

| Field | Value |
|---|---|
| API Key | Your `clb_...` key |
| Base URL | `https://api.collabin.eu` (default — collabin.eu is the primary domain) |

Use the **Test** button to verify the credential — it calls `GET /v1/leave-types`.

## Operations (Collabin node)

Every "Get Many" operation supports:
- **Return All** — automatically pages through the API (500 items per request) and returns every result.
- **Limit** — returns up to a fixed number of results (max `500`, default `50`).

| Resource | Operation | API call | Key permission | Notes |
|---|---|---|---|---|
| User | Get | `GET /v1/users/:id` | Read | |
| User | Get Many | `GET /v1/users` | Read | Optional filters: name, email |
| User | Get Leaves | `GET /v1/users/:id/leaves` | Read | Optional filter: status |
| Team | Get | `GET /v1/teams/:id` | Read | Includes leaders and members |
| Team | Get Many | `GET /v1/teams` | Read | |
| Leave Type | Get Many | `GET /v1/leave-types` | Read | |
| Leave | Get | `GET /v1/leaves/:id` | Read | |
| Leave | Get Many | `GET /v1/leaves` | Read | Filters: User ID, Status, Start/End Date, Updated Since (for incremental sync) |
| Leave | Create | `POST /v1/leaves` | **Write** | Creates a request with status `PENDING` |
| Leave | Update Status | `PUT /v1/leaves/:id/status` | **Write** | Approve or reject a `PENDING` request; returns `409` if it isn't pending |
| Calendar | Get | `GET /v1/calendar` | Read | Workday/holiday calendar for a date range (max 366 days) |

Operations marked **Write** require an API key with Read & Write permission, otherwise the API returns `403 Forbidden`.

## Collabin Trigger node

The trigger node receives outbound webhooks from Collabin and starts the workflow.

### Setup

1. Add the **Collabin Trigger** node to your workflow.
2. Open the node and copy its **Webhook URL** (use the "Test URL" while building the workflow, and the "Production URL" once the workflow is active).
3. In the Collabin dashboard, go to **Settings → Webhooks** and create a new webhook:
   - **URL**: paste the n8n webhook URL from step 2.
   - **Events**: subscribe to the events you care about (`leave.created`, `leave.status_changed`).
4. Collabin shows a **signing secret** once, when the webhook is created. Copy it into the node's **Signing Secret** field.
5. In the node's **Events** field, select which event types should start the workflow. This is a local filter — make sure it matches (or is a subset of) what the webhook in Collabin is subscribed to.

### Signature verification

Every delivery includes:

| Header | Description |
|---|---|
| `X-Collabin-Event` | The event name, e.g. `leave.created` |
| `X-Collabin-Signature` | `sha256=<hex>` — HMAC-SHA256 of the raw request body, keyed with the webhook's signing secret |
| `X-Collabin-Delivery` | A unique delivery ID |

The node recomputes this HMAC over the raw body and compares it (constant-time) to the `X-Collabin-Signature` header. Requests with a missing or invalid signature receive `401 Unauthorized` and **never** trigger the workflow — this happens before any node parameters or downstream nodes run.

### Payload shape

```json
{
  "event": "leave.status_changed",
  "timestamp": "2026-04-07T12:34:56Z",
  "delivery_id": "5f1c1a9b8e2d4f0a91c3a7b6d2e1f4a0",
  "organization_id": 42,
  "data": {
    "id": 100,
    "user_id": 1,
    "leave_type_id": 1,
    "start_date": "2026-04-07T00:00:00Z",
    "end_date": "2026-04-11T00:00:00Z",
    "status": "APPROVED"
  }
}
```

`data` mirrors the corresponding object from the `/v1` API (e.g. the same shape as `GET /v1/leaves/:id`).

### Currently supported events

| Event | Fired when |
|---|---|
| `leave.created` | A new leave request is created (status `PENDING`) |
| `leave.status_changed` | A leave request is approved or rejected |

## Example workflows

- **Notify on new leave requests** — `Collabin Trigger` (`leave.created`) → `Slack`/`Microsoft Teams`/`Email` node, notifying the approver.
- **Approve/reject from an external tool** — any trigger → `Collabin` node (Leave → Update Status) to approve or reject a `PENDING` request from a ticketing system, chatbot, or internal tool.
- **Incremental payroll/HRIS sync** — `Schedule Trigger` → `Collabin` node (Leave → Get Many, `Updated Since` = last run time, `Return All`) → push changes to an external payroll system.
- **AI agent tool** — add the **Collabin** node as a tool on an `AI Agent` node so it can look up users, teams, or leave balances when answering questions.

## Compatibility

- Node.js >= 20.15
- Collabin API version: **v1.2** (`GET /v1/calendar`, pagination + `updated_since` on all list endpoints)

## Development

```bash
npm install
npm run build    # compile TypeScript and copy icons to dist/
npm run lint      # lint with the n8n community node rules
npm run dev       # tsc --watch
```

To try the node in a local n8n instance:

```bash
npm run build
npm link
cd ~/.n8n/custom   # or your N8N_CUSTOM_EXTENSIONS directory
npm link n8n-nodes-collabin
```

Then (re)start n8n — the node appears under "Collabin" in the nodes panel.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Collabin](https://collabin.eu)

## License

[MIT](LICENSE)
