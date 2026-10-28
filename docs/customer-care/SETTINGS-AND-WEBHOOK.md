# Care source settings, webhooks and AI

Status: `technical-pass-live-certification-pending` for E01–E03 and F01–F03. See VALIDATION.md.
The staging app includes these settings, the webhook receiver and the care AI worker.
Real source credentials, model compatibility, business policy approval and real pilot acceptance remain unverified.
The active database is `crm_care_staging`. It retains the owner account and contains no demo customers, templates or integrations after QA cleanup. The old demo remains in `crm_care_demo_test`. Production and D02/D03 acceptance remain open.

## Open the settings

All paths include your workspace slug.

| Area | Path | Access |
|---|---|---|
| POSCake orders and Pancake activity | `/<workspace-slug>/settings/connections/poscake` | Managers configure; workspace members see status without secrets |
| Care model and brand policy | `/<workspace-slug>/settings/care-ai` | Managers configure; workspace members see status without API keys |
| Assistant requests and results | `/<workspace-slug>/care` → **Trợ lý AI** | Workspace members submit requests; managers save their own results as drafts |

The server needs `CARE_CONFIG_ENCRYPTION_KEY` before it stores integration secrets.
A missing encryption key disables saving. Ask the server operator to configure it through the established secret process.
API keys and page tokens remain encrypted in storage. Status responses show configuration state instead of secret values.
The webhook key has a separate manager-only reveal action. Do not put secrets in notes, URLs, screenshots or logs.

## Configure POSCake and Pancake

1. Open **Nguồn POSCake** as an owner or admin.
2. Enter **Tên nguồn**, **Shop ID POSCake** and the POSCake API key.
3. Add each verified Page ID and its brand: UMEHA or Li En Sport. Each page belongs to one brand.
4. Enter the Pancake Page Access Token for each page that needs conversation verification.
5. Select **Lưu cấu hình**, then **Kiểm tra kết nối**. Wait for the worker result for the saved version.
6. Review the status and select **Bật kết nối** after that version passes its connection check.

Blank key fields preserve saved keys during edits. Removing a page also removes its saved page token.
Every save disables the connection and clears its previous check. Repeat save → check → enable after edits.
A stale version requires reloading the page before another change.

The POS check reads an order page. Supplied Pancake tokens are checked against their page conversation list.
A successful connection check does not prove complete order history, full synchronization or verified delivery for every customer.
POS orders can import without a Pancake token. Proactive care stays blocked without verified conversation activity.
Newly imported customers are not automatically enrolled.

Saved app configuration takes priority over the older environment configuration.
Environment fallback applies only when no app source record exists.
A disabled or unchecked app source does not fall back to the environment.
Saving or pausing a source invalidates its old source leases. Full synchronization must restore the source guard before proactive care.
A real source requires a separate operating database. The application blocks enabling it on the synthetic `_test` database.

## Set up the POSCake webhook manually

1. Save the source, complete its check and enable it in CRM.
2. In **Webhook POSCake**, select **Lấy cấu hình webhook** as a manager.
3. Copy the exact **Webhook URL** and the secret **Giá trị custom header**.
4. In POSCake, add the CRM destination for order events. Set custom header `x-crm-webhook-key` to the copied secret.
5. Preserve every existing webhook destination. Do not overwrite a webhook that serves n8n or another system.
6. Review the CRM inbox status after an authorized test. Keep the existing integration intact during verification.

The app displays configuration; it does not register or replace POSCake webhooks.
The endpoint path is `/api/webhooks/care/poscake/<source-id>`.
Copy the generated HTTPS URL. The public proxy must route that API path correctly.
The header is required; an unsigned request is rejected. Keep the secret out of URL query parameters.
An incompatible POSCake webhook setup needs an approved additional destination or routing change before use.
A temporary Quick Tunnel hostname needs reconfiguration after it changes. It does not establish a production endpoint.

HTTP 202 confirms inbox acceptance, not completed import, enrollment, sending or customer delivery.
The inbox stores event identifiers and order references. Duplicate event keys reuse the existing receipt.
The worker reads the canonical order from POSCake instead of trusting delivery fields in the incoming body.
It validates shop, page and order identity. Regular polling continues to reconcile the source.
Webhook processing alone does not establish a complete source scan or clear every freshness guard.

The page shows pending, completed and failed counts, plus the latest 20 receipts.
`PENDING` waits; `RUNNING` holds a lease; `DONE` records processing; `IGNORED` records an excluded scope.
Source failures retry with backoff, up to five attempts, then remain `FAILED` for review.
Review the displayed error and source configuration. Do not reset receipts, claims or verification times to hide a failure.

## Configure the care LLM

1. Open **AI chăm sóc** at `/settings/care-ai` as an owner or admin.
2. Enter the trusted OpenAI-compatible HTTPS base endpoint, including its API path such as `/v1`.
3. Enter the exact model ID and API key. The configured endpoint receives this key.
4. Choose the daily request limit and maximum output tokens per model step.
5. Add verified policy and facts separately for UMEHA and Li En Sport. Leave unknown policy unstated.
6. Select **Lưu cấu hình**, then **Kiểm tra kết nối**. This probe calls the provider and can incur charges.
7. Review the result, then select **Bật kết nối** for the checked version.

The endpoint must resolve to a public HTTPS host. Credentials, query strings and fragments are rejected in its URL.
The model needs tool calling and structured JSON-schema output for assistant requests.
The short connection probe checks a text response. Probe success does not certify tool calling or structured-output compatibility.
Wait at least one minute between probe requests. An interrupted probe is not automatically retried.

The daily limit counts accepted assistant requests across the workspace, using the Vietnam day boundary.
Each assistant request permits at most three model steps. Each step uses the configured output-token limit.
The request limit is not a money limit. A request can cause several billable model calls.
Connection probes are separate provider calls outside the assistant request counter.
At most three requests per user remain pending or running. Failed or interrupted runs do not receive automatic model retries.
Review provider usage separately. A new request or probe can incur another charge.
Saving new settings disables the connection and requires a fresh check before enabling it again.

## Use Trợ lý AI

1. Open `/care` and select **Trợ lý AI**.
2. Select the brand, purpose and relevant tags.
3. Choose **Soạn mẫu chung theo nhóm khách**, **Xem tình huống một khách** or **Hỏi trợ lý**.
4. Select the customer for a customer review. Staff access is limited to their assigned customers.
5. Enter the request and select **Gửi yêu cầu AI**. Review the resulting summary, warnings, tags and optional template.
6. A manager saves their own completed template result with **Lưu thành mẫu nháp để xem và duyệt**.
7. Open **Nội dung** to review the draft. Use the separate existing approval action only after human review.

The provider receives the request, selected brand policy and permitted care context.
The worker can read matching approved templates. Do not paste credentials or unrelated personal data into requests.
Suggested tags do not change customer tags. Saving a generated template creates an unapproved draft.
The assistant does not send messages, enroll customers, approve templates or approve business policy.
Size edits and sizing advice remain outside this feature.
Missing policy is a missing fact, not permission to invent discounts, guarantees or product claims.
An assistant suggestion does not override opt-out, support, reply, uncertainty or source-freshness guards.

## Pending validation and scheduling

E/F remains `implementation-await-validation`. No test counts or successful live probes are claimed here.
Validation still needs permission, secret redaction, webhook replay, source lease, request-limit and model-error evidence.
Model tools, structured output, interface behavior and deployment also need recorded evidence.
Use [VALIDATION.md](VALIDATION.md) for accepted results and [BACKLOG.md](BACKLOG.md) for remaining acceptance work.

Heartbeat `ho-n-t-t-crm-ch-m-s-c-kh-ch-a-d` is **PAUSED** at Nam's request.
Continue authorized manual work. A general **TIẾP** instruction does not resume the heartbeat schedule.
Resume the schedule only after Nam explicitly requests resuming that schedule.
