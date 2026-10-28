# Chạy CRM bằng PM2

Requires Bun 1.4.0, Node >=22, PM2 and Postgres. Bun 1.3 cannot read this upstream lockfile. Keep the repository-root `.env`; no package-level env files.

The upstream tRPC codegen binary requires GLIBC 2.39 on Linux. Build on a compatible environment (for example Ubuntu 24.04) or use a separate compatible code-generation environment. The development container's GLIBC 2.36 workaround and exact validation limits are recorded in `VALIDATION.md`.

## Build

```sh
bun install --frozen-lockfile
bun run --filter=@crm/db db:generate
bun run --filter=api build
bun run --filter=@crm/care-worker build
bun run --filter=agent build:care
bun run --filter=app build
```

Set the chosen server's DATABASE_URL, auth provider and allow-list in `.env`. Apply migrations to the intended CRM database with `bun run db:deploy` after reviewing that target. Never use the development `crm_care_test` database as production. Set CRM_CARE_MODE=true to use care without research/mailbox onboarding. This retains session authentication and manager authorization.

```sh
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

Place HTTPS reverse proxy in front of web/API. Configure APP_URL, API_URL, OAuth callback and cookie scope for the real hostname. Clipboard access requires HTTPS on Android. The UI also exposes selectable text when clipboard access fails.

CRM_WEB_PORT and CRM_BUN_BIN override PM2's web port and Bun executable. Export them in the launch shell. Postgres stays an independent service. The care worker uses one process and database locks; no AI call is required to schedule or compose a template.

## Pre-provisioned password access

Care mode supports optional email/password login without an external identity provider.
Set `CRM_CARE_MODE=true` and `CRM_CARE_PASSWORD_AUTH=true` in the root `.env`.
Keep the exact staff email addresses in `ALLOWED_SIGN_IN`. Public signup stays closed.
The allow-list is checked when a new care session starts, including existing accounts.

Create a private password file on the server with mode `600`. Use at least 12 characters.
Do not put the password in a shell command, Git, a log or this document. Run:

```sh
bun tools/customer-care/provision-access.ts \
  --database <exact-database-name> \
  --email <allowed-staff-email> --name <staff-name> --role <owner-or-admin-or-member> \
  --password-file <private-file-path>
```

The command checks the explicit database target and requires an existing workspace.
It creates a hashed credential and membership. It refuses an existing password or a role change.
It does not mark email verification, enroll customers or approve templates.
Restart web/API after changing auth configuration. Password reset by email is not configured.

## Source verification

The E/F additions pass technical validation and run in staging. Read [source settings, webhooks and the care assistant](SETTINGS-AND-WEBHOOK.md). Real source/model certification remains pending. The fourth CRM process, `crm-care-agent`, processes explicitly requested care AI work.

Read `SOURCE-CONTRACTS.md`. The direct source adapter is not yet live-certified. Source credentials are optional. Missing credentials disable source pulls. No API key, token or URL query is logged.

Do not set `activityVerifiedAt` from `conversation.updated_at`. Tag edits can change that field. The adapter reads actual messages using the official v1 endpoint and validates page/conversation/customer IDs before recording activity verification. The official conversation list uses v2 with `last_conversation_id`, not numbered pages. The native wrapper's documented v2 message route returned HTML; this was traced to the version mismatch using the official OpenAPI specification. Both brand pages were confirmed through live GET-only POS shop metadata. Direct authenticated runtime sync still needs certification.

The source watermark advances only after every requested page imports successfully. Errors and pagination limits retain the watermark. Polling has a two-day overlap and an initial 120-day window; it is not proof of full customer purchase history. Daily full reconciliation and live pagination drift tests remain acceptance work. Do not report first-ever purchase or revenue attribution from that partial window.

Enrolled customers with source context older than ten minutes are refreshed separately by exact POS customer ID, oldest first, at most 100 per channel/cycle. This reads their newest brand order and actual conversation activity even when that order lies outside the incremental window. A scope mismatch fails the cycle. The source lease is renewed during pagination/refresh and a lost lease stops that worker. This does not certify source availability or complete historical purchase coverage.

Keep demo and automated tests in separate databases. The synthetic helper uses DATABASE_URL; the test runner uses TEST_DATABASE_URL. Do not point the full suite at a populated demo database: the upstream membership tests require an empty workspace and deliberately refuse to delete foreign members. Do not clear those rows merely to make tests pass.

## Staff recovery

1. Open **Khách hàng** to resolve a pending reply or support issue without a task. Only the assigned staff member or a manager records the result.
2. Review **Tin đến gần nhất** and enter **Kết quả xử lý hội thoại/hỗ trợ**. Select **Đã xử lý phản hồi/hỗ trợ** after checking Pancake. A newer reply requires a reload and another review.
3. Customer-profile resolution preserves sent counts, promises and opt-outs. Resolve uncertain sending results on the waiting task first.
4. Select **Nhận xử lý** to renew the 30-minute task lease. A copied task keeps its prepared text. The interface uses the returned version for confirmation. Record the actual outcome once.
5. Reload after a task or template version conflict. Review the changed record before retrying. Managers approve or revoke only the reviewed template version.
6. Wait for a complete successful source cycle after a source error or active sync. Removing credentials does not clear stored source guards. Do not change verification times or leases to unblock contact.

## Pilot

1. Verify actual source identity, delivery history and message activity.
2. Configure employee sign-in and manager roles.
3. Approve the business policy and template versions.
4. As a manager, open **Khách hàng**. Select each intended candidate using **Chọn xem trước**. Selection starts empty and accepts 1–100 unique customers per report. Selection persists across list pages within the current screen.
5. Select **Xem trước điều kiện**. Review blockers, verified delivery, D+x, approved template version and source check times. The report reads current stored data. It does not refresh external sources, enroll customers, create tasks or return message text.
6. Resolve each blocker through the normal customer/source workflow. A milestone with an existing task remains occupied, including a cancelled task. Check history instead of resetting records. A Pancake API restriction remains visible for staff review.
7. Recheck the report after source or policy changes. Explicitly enroll each reviewed customer at their profile. The report is a snapshot; normal eligibility checks still apply. Target 50–100 real customers only after access, source and policy verification.
8. Observe employee use on real Android devices for approximately two weeks.
9. Reconcile manual confirmations against platform history where available.

Code tests and a synthetic browser walkthrough do not complete the real pilot. The heartbeat is PAUSED at Nam's request. A general “TIẾP” instruction continues manual work; it does not resume the schedule. Resume scheduling only after Nam explicitly requests it.
