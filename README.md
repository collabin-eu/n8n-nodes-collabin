# n8n-nodes-collabin

This is an n8n community node package for [Collabin](https://collabin.eu), a multi-tenant leave management (HR) platform.

It lets you manage leave requests, users, teams and the workday calendar via the Collabin REST API, and react in real time to leave events via webhooks — directly from your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## What's included

| Item | Type | Description |
|---|---|---|
| **Collabin** | Action node | CRUD/read access to Users, Teams, Leave Types, Leaves and the Calendar via `/v1`. Also usable as a tool by AI Agent nodes. |
| **Collabin Trigger** | Trigger node | Starts a workflow when Collabin sends a webhook (`leave.created`, `leave.status_changed`, `presence.created`, `presence.updated`, `presence.revoked`), with built-in `X-Collabin-Signature` verification. |
| **Collabin API** | Credentials | Stores your API key and base URL, used by the **Collabin** node. |
| **Collabin Webhook API** | Credentials | Stores the webhook signing secret encrypted in n8n, used by **Collabin Trigger**. Workflow exports contain only its name and ID. |

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

User, Team, Leave Type and Leave "Get Many" operations support:
- **Return All** — automatically pages through the API (500 items per request) and returns every result.
- **Limit** — returns up to a fixed number of results (max `500`, default `50`).

| Resource | Operation | API call | Key permission | Notes |
|---|---|---|---|---|
| User | Get | `GET /v1/users/:id` | Read | |
| User | Get Many | `GET /v1/users` | Read | Optional filters: name, email |
| User | Get Leaves | `GET /v1/users/:id/leaves` | Read | Optional filter: status |
| Team | Get | `GET /v1/teams/:id` | Read | Includes leaders and members |
| Team | Get Many | `GET /v1/teams` | Read | |
| Leave Type | Get Many | `GET /v1/leave-types` | Read | Includes each type's quota rules (period, default quota, blocking, deducting types) and minimum notice |
| Leave | Get | `GET /v1/leaves/:id` | Read | |
| Leave | Get Many | `GET /v1/leaves` | Read | Filters: User ID, Status, Start/End Date, Updated Since (for incremental sync) |
| Leave | Create | `POST /v1/leaves` | **Write** | Creates a request with status `PENDING`; only the calendar dates are used. Returns `422 QUOTA_EXCEEDED` when a blocking leave quota would be exceeded. Notifies the approvers unless **Send Notifications** is off |
| Leave | Update Status | `PUT /v1/leaves/:id/status` | **Write** | Approve or reject a `PENDING` request; returns `409` if it isn't pending. Notifies the employee unless **Send Notifications** is off |
| Presence Rule | Get Many | `GET /v1/presence-rules` | Read | Returns every rule, including past and revoked rules; this endpoint is not paginated |
| Presence Rule | Preview | `POST /v1/presence-rules/preview` | **Write** | Shows affected employees without saving or sending mail |
| Presence Rule | Create | `POST /v1/presence-rules` | **Write** | Creates the rule and queues mandatory operational notifications |
| Presence Rule | Update | `PUT /v1/presence-rules/:id` | **Write** | Full rule replacement; requires the reviewed revision |
| Presence Rule | Revoke | `POST /v1/presence-rules/:id/revoke` | **Write** | Requires the reviewed revision |
| Calendar | Get | `GET /v1/calendar` | Read | Workday/holiday calendar for a date range (max 366 days) |

Operations marked **Write** require an API key with Read & Write permission, otherwise the API returns `403 Forbidden`.

**Send Notifications** (Leave → Create and Update Status, on by default): Collabin notifies the people involved, as for a request made in Collabin. The approvers are told about a new request, and the employee about a decision. Each person gets an in-app notification and an e-mail only if they turned that kind of notification on in their profile. The e-mail names your API key as the one who decided. Turn it off, for example, when importing past leave, so nobody is flooded with messages.

## Mandatory presence (requires the presence-enabled backend release)

The new Presence Rule operations and presence trigger events require the backend with `/v1/presence-rules`; earlier backends keep supporting the existing operations. This source update must be built and installed in n8n before these controls appear.

Presence is available on **Advanced and Pro**, even with approvals disabled. External API and webhook entitlements are separate: normally **Pro**, or an explicit Superadmin override. An API override alone does not unlock presence on a lower plan.

1. Use **Team → Get Many** and **Leave Type → Get Many** to find the scope IDs.
2. Select **Presence Rule → Preview**, enter the dates, affected type IDs and team IDs, or explicitly enable **Entire Organization**.
3. Choose **Warn** (requests allowed) or **Block** (new/edited requests rejected with `422 PRESENCE_BLOCKED`). Existing requests stay unchanged.
4. Review the affected employees, then use **Create** or **Update** with the same fields. Updates and revocations require `revision` from **Get Many**. `409 PRESENCE_CHANGED` means someone changed the rule; fetch it again and review before retrying.

Operational presence e-mails are mandatory and ignore general notification preferences. The leave **Send Notifications** switch does not disable them. Empty team IDs are rejected unless **Entire Organization** is explicitly on.

For a pending leave with presence conflicts, **Leave → Get** returns `presence_check.conflicts` and `presence_check.token`. Present the conflicts to the decision-maker, then pass the explicitly reviewed token in **Update Status → Presence Token**. Copy `updated_at` unchanged into **Expected Updated At**, including fractional seconds, to detect intervening request edits. Do not fetch a fresh token and automatically approve after a `409`: the changed conflict requires a new review. Rejections do not require a presence token.

Leave list filters also support `WITHDRAWN`, `CANCELLATION_REQUESTED` and `CANCELLED`; Update Status still only approves/rejects `PENDING` requests.

## Collabin Trigger node

The trigger node receives outbound webhooks from Collabin and starts the workflow.

### Setup

1. Add the **Collabin Trigger** node to your workflow.
2. Open the node and copy its **Webhook URL** (use the "Test URL" while building the workflow, and the "Production URL" once the workflow is active).
3. In the Collabin dashboard, go to **Settings → Webhooks** and create a new webhook:
   - **URL**: paste the n8n webhook URL from step 2.
   - **Events**: subscribe to the events you care about (`leave.created`, `leave.status_changed`, `presence.created`, `presence.updated`, `presence.revoked`).
4. Collabin shows a **signing secret** once, when the webhook is created. Create a **Collabin Webhook API** credential in n8n, save the secret in its **Signing Secret** field, and select this credential on the trigger. Keep the secret out of node parameters, workflow JSON, and shared examples.
5. In the node's **Events** field, select which event types should start the workflow. This is a local filter — make sure it matches (or is a subset of) what the webhook in Collabin is subscribed to.

### Upgrading existing triggers

This security update requires an explicit migration for triggers that stored a **Signing Secret** directly in the node. That value was included in workflow exports and history. Both supported trigger versions now require a **Collabin Webhook API** credential. n8n may prevent activation until this credential is configured; the trigger itself rejects a populated legacy parameter with `401` and a migration message. There is no fallback to the old parameter.

1. Schedule a short maintenance window and disable the old webhook in **Collabin → Settings → Webhooks**. Record the existing production webhook URL and selected events. Collabin does not retry missed webhook deliveries automatically; reconcile changes from this window afterward with **Leave → Get Many → Updated Since → Return All**.
2. Update this package and restart n8n. The existing version 1 trigger remains recognizable and keeps its webhook URL, event selection, and output shape.
3. Create a replacement webhook in Collabin with the same URL and events to generate a **new signing secret**. Keep the old webhook disabled. Rotate the secret even if you have never deliberately shared the workflow: old exports and workflow history can retain its previous value.
4. Save the new secret in a **Collabin Webhook API** credential, then select that credential on the existing trigger. Clear the **Legacy Signing Secret** field, save the workflow, and activate it. The legacy value must be empty even when a credential is selected.
5. Verify a test event and reconcile the maintenance window. New triggers use version 2, which has no signing-secret parameter. A migrated version 1 trigger is also safe to keep; clear its legacy field before upgrading its node version. If replacing the trigger instead, use the replacement node's production URL in the new Collabin webhook.

This package cannot rotate a Collabin webhook or rewrite existing workflow history on your behalf. Merely masking the old field or upgrading the node version does not remove secrets from earlier exports. The new credential must not reuse the exported secret.

### Signature verification

Every delivery includes:

| Header | Description |
|---|---|
| `X-Collabin-Event` | The event name, e.g. `leave.created` |
| `X-Collabin-Signature` | `sha256=<hex>` — HMAC-SHA256 of the raw request body, keyed with the webhook's signing secret |
| `X-Collabin-Delivery` | A unique delivery ID |

The node reads the signing key from its encrypted credential, recomputes this HMAC over the raw body, and compares it (constant-time) to the `X-Collabin-Signature` header. Requests with a missing or invalid signature receive `401 Unauthorized` and **never** trigger the workflow. Signature verification happens before resolving the event-filter parameter or running downstream nodes.

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

`data` contains the leave object for leave events (as in `GET /v1/leaves/:id`), or the presence rule for presence events. Presence rules include `request_policy`, `revision`, scope IDs and `revoked_at`. Leave objects include `presence_check` when the feature is available.

### Currently supported events

| Event | Fired when |
|---|---|
| `leave.created` | A new leave request is created (may already be auto-approved in the dashboard) |
| `leave.status_changed` | A leave request is approved, rejected, withdrawn, or its cancellation status changes |
| `presence.created` | A mandatory presence rule is created |
| `presence.updated` | A mandatory presence rule changes (including policy or scope) |
| `presence.revoked` | A mandatory presence rule is revoked |

## Example workflows

- **Notify on new leave requests** — `Collabin Trigger` (`leave.created`) → `Slack`/`Microsoft Teams`/`Email` node, notifying the approver.
- **Approve/reject from an external tool** — any trigger → `Collabin` node (Leave → Update Status) to approve or reject a `PENDING` request from a ticketing system, chatbot, or internal tool.
- **Incremental payroll/HRIS sync** — `Schedule Trigger` → `Collabin` node (Leave → Get Many, `Updated Since` = last run time, `Return All`) → push changes to an external payroll system.
- **AI agent tool** — add the **Collabin** node as a tool on an `AI Agent` node so it can look up users, teams, leave types and leave requests when answering questions, or record a leave request.

## Compatibility

- Node.js >= 20.15
- Collabin Trigger versions 1 and 2 are supported; version 2 is the default. Both require **Collabin Webhook API** credentials. Existing plaintext-secret triggers require the explicit [upgrade steps](#upgrading-existing-triggers) above.
- Collabin API version: **v1.4** (notifications for leave created or decided through the API, with the `notify` switch); v1.3 and earlier keep working, but they send no notifications and ignore **Send Notifications**

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
