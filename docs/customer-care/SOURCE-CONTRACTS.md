# Source contracts

## Identity

Brand + POS shop ID + POS customer ID identify a care customer. Never merge on name. Store the exact POS name and exact SKU strings. A conversation additionally requires the exact Pancake page ID and conversation ID. Cross-brand links need explicit evidence and do not grant cross-brand marketing permission.

## Delivery

`deliveredAt` requires the source's actual delivery-success evidence. A status without a timestamp is insufficient for D+x. Created/updated/shipped times are not delivery times. Cancelled, returned, partially delivered or unknown orders cannot enroll a whole-order post-purchase sequence.

## Access and transport

Initial integration is read-only. No source edits, size changes or sending calls. Platform refusal stays refusal, including during a manual attempt. Staff copy and staff confirmation are local records only. They do not prove platform acceptance or customer delivery.

## Verification state

- POSCake shop `715121705` is Li En Sport. A live GET-only `pos_shop.list` also lists Umeha Sport page `104580652103482` and Li En Sport page `270434600067434` under this same shop. Both brand mappings now have source evidence.
- Connected GET-only Pancake tool identifies page `270434600067434` as Li En Sport Đồ Tập Cao Cấp. This does not establish UMEHA's mapping.
- Upstream CRM is single-tenant. Its singleton Organization is membership metadata, not a SaaS isolation boundary. No claim of tenant readiness.
- Live POS order inspection verified `customer.id`, `items[].variation_info.display_id`, exact SKU strings and the delivery event in `status_history.status=3`. Status 16 does not replace the actual delivery timestamp.
- The official OpenAPI specification at https://developer.pancake.biz/openapi/openapi.yaml specifies v2 conversation listing with `last_conversation_id` cursor pagination and v1 message reading. The fixed-page MCP wrapper documented a v2 message route; that route returned HTML. No out-of-scope URL was attempted through that wrapper.
- The worker now follows the official v2 cursor and v1 message contracts. It validates page/conversation/customer identity, ignores system/removed messages, extracts only actual message timestamps and preserves the platform permission flag. Tests use synthetic wire responses. Direct authenticated live sync is still unverified because runtime credentials are absent.
- API refusal does not disable manual preparation/copy. Copy never changes the platform flag. Staff confirmation is a local report, not proof of platform acceptance or delivery. Opt-out, unresolved support, uncertainty and stale context still block proactive work.
- Repeated order IDs, changed page totals and incomplete numbered pages fail the scan. An empty first page with zero or one total page is a valid empty result. Repeated conversation cursor records fail without replacing a newer mapping. Watermarks remain unchanged on incomplete scans.
- Every worker import carries its source lease identity. The database checks token, scope and expiry under a shared source-row lock before writes. A replaced/expired worker cannot write from an old request. Source errors and in-flight scans block care actions even when customer timestamps look fresh; removing runtime credentials does not remove an existing source error guard.
- Conversation timestamps do not move backwards when a recent message page omits older activity. Only a newer inbound reopens reply handling. Human acknowledgement binds to the inbound timestamp displayed to staff; newer replies require a fresh review.
