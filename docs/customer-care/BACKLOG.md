# CRM chăm sóc khách hàng — backlog A–D

Approved: 2026-10-27, Asia/Ho_Chi_Minh. Owner: Nam.
Repository: https://github.com/namese1994/crm
Branch: codex/customer-care. Upstream baseline: 711c909cf016e738c5b2e9418310485ad67bee47.

## Scope and boundaries

UMEHA and Li En Sport; three staff; 300–500 orders/month. POSCake owns orders and customer names. Pancake owns conversations. D is verified delivery success. V1 reminds staff and copies content. No customer sending endpoint. Do not modify size, size tables or size advice. Treat the user's “miên sửa size” as this exclusion until corrected.

Android responsive web is the current assumption from answer #9. APK, offline and push remain outside V1. PM2 is preferred. Real server details, employee accounts, business policies and production connector credentials are not supplied in chat. Discover existing authorized capabilities before requesting any input. Keep those dependencies separate from local implementation.

## Acceptance backlog

| ID | Phase | Deliverable | Acceptance criteria |
|---|---|---|---|
| A01 | A | Fork and baseline | Fork owned by Nam; upstream remote retained; feature branch cut from main; MIT retained; baseline recorded. |
| A02 | A | Source contracts | Read-only POSCake/Pancake field and pagination contracts verified; exact shop/page mapping; no name-only identity merge; delivery timestamps never inferred from created/updated time. |
| A03 | A | Runtime | Reproducible install; API, web and worker build; PM2 config; restart preserves tasks; no Vercel agent required for care. |
| A04 | A | Policies and access | Manager-only template approval and pilot enrollment; unavailable policies stay unverified; no invented discounts, washing settings or benefits. |
| B01 | B | Durable data | Brand-scoped customers, orders, conversations, templates, tasks and append-only events; migration applies to isolated Postgres; exact SKU strings preserved. |
| B02 | B | Source ingestion | Validated imports; stale updates rejected; replay is idempotent; cursor advances only after complete page committed; no raw message bodies stored. |
| B03 | B | Assignment | Valid workspace member owns work; simultaneous staff cannot claim the same customer task; handoff audited. |
| B04 | B | Customer context | Correct brand, order, products, verified delivery, tags, next action, owner and conversation shown; source freshness visible. |
| C01 | C | D+x scheduling | D+1/5/12/30/60/90 configurable in one module; opt-in pilot only; cancel on return/cancel/new order; skip expired milestones instead of catch-up bursts. |
| C02 | C | Eligibility | Opt-out, support issue, reply, future promise, recent touch, repeated silence, stale source and missing delivery block proactive work; rechecked at copy and confirmation. |
| C03 | C | Content library | Brand, purpose, tags, exclusions, required variables, version, expiry and approval; drafts cannot be copied for customer use; missing variables fail closed. |
| C04 | C | Manual workflow | Claim → preview → copy → open Pancake → explicit result; copy never implies sent; confirmation is staff-reported, never delivery proof. |
| C05 | C | Outcomes | Sent, blocked, uncertain, snooze, skip, replied, issue and opt-out are distinct; uncertain freezes further touches until resolved; no automatic retry/send. |
| C06 | C | Android UI | Usable at 360/390/412px, no horizontal overflow, touch controls, selectable copy fallback, clear error state, no customer data in localStorage. |
| C07 | C | Metrics | Queue and response metrics; mature 30/60/90-day cohorts; returns excluded; manual sent and verified platform delivery distinct; no causal revenue claim. |
| D01 | D | Regression evidence | Tests cover concurrency, restart/replay, template expiry/revocation, cross-brand IDs, opt-out, recent conversation, date boundary and copy≠sent. |
| D02 | D | Pilot preparation | 50–100 eligible real customers selected explicitly; dry-run output and source freshness reviewed; three employees can sign in; policies approved. |
| D03 | D | Observed pilot | Staff use real Android devices; outcomes collected for approximately two weeks; issues resolved; Nam can review usage evidence. Synthetic tests do not satisfy this item. |

## Definition of done

### Trạng thái ngày 27/10/2026

| ID | Trạng thái | Bằng chứng / phần còn lại |
|---|---|---|
| A01 | Đạt | Fork, hai remote, baseline và branch đã có |
| A02 | Một phần | Shop/page và trường nguồn đã kiểm tra GET; adapter trực tiếp còn chờ chứng nhận với token runtime |
| A03 | Đạt với bản test | Ba build, PM2 và URL HTTPS tạm truy cập được; chưa phải triển khai production hoặc kiểm tra reboot; cần codegen GLIBC tương thích |
| A04 | Một phần | Có phân quyền quản lý và duyệt nội dung; chính sách thật chưa đưa vào |
| B01 | Đạt qua kiểm thử | Migration Postgres, khóa ngoại, SKU, danh tính và sự kiện |
| B02 | Một phần | Import, replay, lease, 429, refresh khách có đơn cũ đã có test; còn đồng bộ trực tiếp và đối soát đủ lịch sử |
| B03 | Đạt qua kiểm thử | Membership, phân công, lease, cạnh tranh và audit |
| B04 | Đạt với dữ liệu mẫu | UI hiển thị ngữ cảnh và độ mới nguồn; khách thật chờ D02 |
| C01–C05 | Đạt qua kiểm thử kỹ thuật | 43 ca CRM và walkthrough copy/xác nhận; mẫu thật chưa được duyệt |
| C06 | Một phần | Không tràn 360/390/412px; bốn tab ở 360px; chưa nghiệm thu Android thật |
| C07 | Đạt qua kiểm thử kỹ thuật | Kết quả 30 ngày theo nhân viên, mẫu số khách đã kiểm tra, tin đến sau xác nhận gần nhất và cohort mua lại; không suy diễn nhân quả |
| D01 | Đạt phạm vi chăm sóc; còn lỗi suite kế thừa | API 460 test, app 236 test; kiểu/lint/ba build đạt. Lượt toàn repo mới lỗi agent nghiên cứu `retireExhausted`, file baseline không đổi; xem VALIDATION.md |
| D02 | Một phần kỹ thuật; chưa nghiệm thu thật | Có bản test HTTPS, tài khoản test owner và xem trước 1–100 khách không ghi dữ liệu. Chưa nghiệm thu ba nhân viên thật, chính sách đã duyệt, token runtime và 50–100 khách thật đã chọn |
| D03 | Chưa bắt đầu | Không có bằng chứng nhân viên/khách thật sử dụng; không tính dữ liệu mẫu là pilot |

Tình huống kinh doanh và hành vi tương ứng: `SCENARIOS.md`. Chi tiết bằng chứng và giới hạn: `VALIDATION.md`.

A–D is complete only when every acceptance item has evidence, including observed pilot. Do not close the heartbeat because code compiles. Do not mark live source sync, deployment, content approval or real usage as completed from fixtures.

## Operating rules

One proactive touch/customer/brand/7 days initially. Immediate support remains separate. Two unanswered proactive touches pause nurturing. A customer reply pauses the sequence. A new purchase recalculates from verified delivery. A copied but unconfirmed message stays pending. Uncertain results require reconciliation. The copy path never overrides a platform refusal or customer opt-out.

## Resume

Read `CHECKPOINT.md`, this backlog, `SOURCE-CONTRACTS.md`, then the changed source/test files. Keep heartbeat `ho-n-t-t-crm-ch-m-s-c-kh-ch-a-d` active every 30 minutes until actual completion. Report only meaningful changes or actionable blockers.
