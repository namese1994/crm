# Checkpoint CRM A–D

Cập nhật: 27/10/2026, Asia/Ho_Chi_Minh. Đọc cùng BACKLOG.md, SOURCE-CONTRACTS.md, SCENARIOS.md và VALIDATION.md.

## Cải thiện khả dụng và QA độc lập 28/10/2026

- Kiểm thử synthetic ranh giới D+1→D+5 và độ mới CareSyncState.lastSuccessAt hết trong chờ template cho copy/confirmation: đều 409, không ghi SENT; task/snapshot giữ theo tình huống. QA độc lập review source key UUID và cleanup theo ID; 60 ca/241 assertions, 11 typecheck đạt. Delay mô phỏng elapsed, không chứng minh đồng bộ POSCake/Pancake thực. Chưa triển khai.
- Bổ sung 6 test synthetic riêng cho mẫu hết hạn, customer.syncedAt và conversation.activityVerifiedAt hết độ mới sau chờ, trên cả copy và SENT_MANUAL: 409 đúng và không ghi snapshot/confirmedAt/event ngoài điều kiện tương ứng. QA độc lập review; 56 ca/217 assertions và 11 typecheck đạt. Delay giả lập sau lock, chưa chứng minh kênh CareSyncState.lastSuccessAt hoặc gửi ngoài CRM. Chưa triển khai.
- Copy và xác nhận SENT_MANUAL khóa mẫu FOR SHARE, đọc lại version/duyệt/brand/purpose/tag/hạn; kiểm lại lease và eligibility theo thời gian monotonic sau chờ, ghi copiedAt/confirmedAt/lastTouchAt sau chờ. Bốn test synthetic với đúng blocker PID cho copy/confirm và thu hồi hai chiều, thêm test hết lease và timestamp sau delay; 50 ca/190 assertions, 11 typecheck đạt, QA độc lập review. Giới hạn: chưa chứng minh race đổi nội dung/tag/brand/purpose, hết hạn nguồn/mẫu khi chờ hoặc mẫu ưu tiên khác xuất hiện; bảo vệ tới lúc kiểm/commit CRM, không kiểm soát tin đã gửi bên ngoài. Nếu xác nhận bị từ chối sau gửi, đối soát UNCERTAIN, không gửi lại. Chưa triển khai.
- Lưu/chỉnh sửa và duyệt/thu hồi template kiểm lại role manager dưới FOR SHARE trong transaction. Test synthetic hai thứ tự approval/demotion quan sát đúng blocker PID; sau demotion duyệt bị từ chối và version/approvedAt không đổi, nếu duyệt giữ lock trước thì demotion chờ commit. QA độc lập review; full care integration 43 ca/161 assertions và 11 typecheck đạt. Chưa kiểm race save-vs-demotion/DELETE; chưa khóa template khi copy/confirm nên sửa/thu hồi mẫu đồng thời là việc ưu tiên tiếp theo. Không tự duyệt nội dung thật, chưa triển khai.
- Thử môi trường build Windows cô lập tại thư mục temp `crm-ci-c73c106-20261028`, archive commit c73c106, dữ liệu/URL giả, Bun 1.4.2, lifecycle scripts tắt: cài 959 package và Prisma generate đạt. Next build với 1 CPU và heap 1536MB phải dừng thủ công khi RAM trống của máy giảm khoảng 630 MB; process test đã thoát, RAM trống phục hồi. Không phải build pass, không dùng credentials thật, không deploy. Không chạy tiếp build nặng trên máy này khi thiếu headroom; cần môi trường build có đủ tài nguyên.
- Resolve khách và cấu hình phân công đọc quyền actor trong transaction, khóa member FOR SHARE sau customer; khi khóa actor + owner dùng thứ tự userId ổn định. Kiểm synthetic thực: demotion/resolve hai chiều theo đúng blocker PID; DELETE owner trước cấu hình trả 400, ownerId và event không đổi; actor tự phân công/null/owner thiếu được kiểm tuần tự. Review độc lập xác nhận phạm vi hẹp, 40 ca/149 assertions và 11 typecheck đạt. Chưa kiểm các chiều cạnh tranh configure khác, thay đổi role ở template, login auto-enroll hoặc n8n; chưa triển khai.
- Gia cố xóa membership đồng thời: tick, claim, copy, action và kiểm owner khi phân công khóa khách rồi khóa dòng member FOR KEY SHARE. Hai test claim/DELETE với DB synthetic quan sát đúng PID đang chặn trong pg_blocking_pids: xóa commit trước thì claim 403, claim giữ khóa trước thì DELETE đợi claim commit. Review độc lập không thấy lỗi chặn; 34 ca/130 assertions, 11 typecheck đạt. Giới hạn: chưa kiểm concurrency tương tự cho tick/copy/action; resolveCustomer và thay đổi quyền quản lý vẫn có race riêng; tự cấp membership khi đăng nhập lại và n8n ngoài phạm vi. Không thay production, không tự gửi.
- Khi owner bị gỡ membership, tick tuần tự không tạo việc mới hoặc mở lại hẹn; giao owner hợp lệ và tick có thể tiếp tục. Danh sách cảnh báo owner thiếu hoặc không còn trong workspace. Test synthetic có WAITING/PROMISED và claim+copy thật: bàn giao chuyển sang UNCERTAIN, giữ snapshot và lastTouchAt, không ghi SENT_MANUAL/RECONCILED_SENT; test mục tiêu 8 assertions. Trước hai assertion bổ sung: 32 ca/120 assertions, 11 typecheck và 10 lint đạt. QA độc lập review logic và kiểm UI fixture hai vai trò tại 360/1280; chưa triển khai. Còn race gỡ membership đồng thời với tick/claim/copy: chưa khóa member trong transaction, chưa chứng nhận thu hồi hoàn chỉnh khi đăng nhập lại.
- Kiểm kê credential read-only: pg_stat_activity chỉ thấy kết nối staging tại thời điểm đọc, application_name trống nên không đủ quy kết consumer; PM2 có web/API/worker/agent online, care-agent có DATABASE_URL và TEST_DATABASE_URL trong PM2 env trong khi các process khác có thể nạp .env. Vai trò DB hiện tại không có quyền superuser, tạo role hay tạo database. Đổi riêng file .env chưa đủ chứng minh mọi process cập nhật; không giả định đã kiểm kê toàn bộ consumers hoặc đã thu hồi credential.
- Cần xử lý credential: QA độc lập báo một lỗi tạo database giả đã in URL kết nối test vào output tool. Đã đối chiếu an toàn: test và staging dùng cùng host, port, username và mật khẩu, database khác nhau. Không ghi credential vào tài liệu. Cần kiểm kê đầy đủ consumers và lập phương án đổi credential, cập nhật/restart có kiểm soát; chưa tự đổi mật khẩu hoặc sửa dịch vụ. Không coi output tool là bằng chứng bị công khai Internet.
- Bổ sung cảnh báo rõ cho khách đã vào pilot nhưng chưa phân công: không tạo việc mới; quản lý được hướng dẫn phân công, nhân viên được hướng dẫn nhờ quản lý. Test synthetic xác nhận trước phân công 0 việc, sau phân công và tick 1 việc. QA độc lập kiểm fixture 360px cho cả hai vai trò (15/15 mỗi vai trò); không có gửi tin hoặc thay dữ liệu thật. Chưa triển khai.
- Thử build Next tách biệt giới hạn 1 CPU và heap 768 MB: không hoàn tất trong thời gian giới hạn; gateway và URL thử nghiệm tạm không đáp ứng trong lúc build, sau đó URL trả HTTP 200 và các process CRM online. Không chạy lại build nặng trên host đang dùng cho tới khi xác định năng lực tài nguyên hoặc có môi trường build riêng; không suy ra build pass. Không thay PM2, DB hoặc source thật.
- Nam yêu cầu tiếp tục cải thiện, kiểm thử và review độc lập; heartbeat `ho-n-t-t-crm-ch-m-s-c-kh-ch-a-d` đã bật lại mỗi giờ. Không tự gửi, enroll hay duyệt khách thật; không sửa size.
- Thực tế đã có khách được người dùng đưa vào pilot; không dùng số 0 enrolled của snapshot cũ làm trạng thái hiện tại. Giữ nguyên dữ liệu đang có.
- Đã thêm tìm theo tên/mã POSCake, lọc brand và trạng thái pilot phía server, phân trang ổn định; giữ lựa chọn ẩn và có cảnh báo. Test synthetic 35 khách và ký tự %/_ đạt. Review tĩnh độc lập không thấy lỗi chặn; fixture React/tRPC giả với đúng source chạy tìm, lọc, đổi trang, giữ/bỏ chọn ở Chromium 360/1280 không tràn và không pageerror. Test do QA độc lập soạn, sau đó sửa locator checkbox thành button và chạy lại; không thay cho Next app thật.
- Đã thêm kiểm tra membership cho cả hai router care; test synthetic ở lớp middleware đạt; QA độc lập kiểm HTTP/DI cả hai router: member 200, sau khi xóa membership của user mẫu, cùng session nhận 403. Đăng nhập lại có thể tự phục hồi membership theo auth gốc, chưa chứng minh thu hồi quyền hoàn chỉnh.
- API care integration 29 ca/102 assertions, typecheck 11 task và lint 10 task đạt. Next dev cô lập bị SIGKILL khi compile PostCSS, chưa có QA browser; không suy ra production pass. Chưa build/deploy bản mới.
- Đã bổ sung hướng dẫn 3 bước và nút mở từng tab trong care-board, cuộn/focus khi chuyển tab. Typecheck 11 task và lint 10 task đạt. Review mã độc lập đã thực hiện; chưa có bằng chứng browser cho bản mới, chưa build hoặc triển khai bản này vào PM2.
- QA độc lập quan sát màn thật: xem trước điều kiện chạy, 30 khách/trang, không có tìm kiếm/lọc theo brand hoặc trạng thái; ưu tiên thiết kế tìm kiếm phía server, phân trang đúng và kiểm thử. Li En Sport vẫn có cảnh báo đồng bộ.
- Kiến trúc hiện tại dùng một workspace và cấu hình care toàn cục; chưa đủ cơ sở bán SaaS chung nhiều khách hàng. Cần thiết kế và kiểm thử cách ly theo tenant, hoặc phương án mỗi khách một DB riêng trước khi thương mại hóa. Chưa chứng minh lộ dữ liệu giữa tenant đang chạy.
- Tiếp tục: kiểm thử UI mới ở môi trường cách ly, kiểm thử mobile và bàn phím, review độc lập sau sửa, rồi cân nhắc triển khai staging không làm gián đoạn người dùng. Tiếp tục chứng nhận tìm kiếm/lọc trên Next app và kiểm tra quyền thành viên hết hiệu lực: review tĩnh thấy care read dùng session, cần thử synthetic sau khi xóa membership; chưa xác nhận lỗi runtime. QA đề xuất dùng DB giả lập riêng, API/Next cổng riêng, không dùng worker nguồn hoặc DB staging. Không xem QA giả lập là pilot thật.

## Repo và phạm vi

- Fork: https://github.com/namese1994/crm, branch `codex/customer-care`.
- Baseline upstream main: `711c909cf016e738c5b2e9418310485ad67bee47`.
- Commit nền triển khai: `f81fab7`; bản vá dependency: `04182b1`; bản sửa review: `78f59bc`; đồng bộ tài liệu: `5e0fb40`.
- Nhánh đã push lên fork. PR nháp: https://github.com/namese1994/crm/pull/1, base `main`. Chưa merge hoặc triển khai production.
- Windows ưu tiên theo Nam: `Y:\AI_Workspace\apps\crm`. Cùng checkout với `\\100.104.251.126\Documents\AI_Workspace\apps\crm`; không tạo bản sao hoặc Git lồng trong gstack.
- Linux cùng file: `/workspace/apps/crm`, qua nam-mcp workspace runner, container phát triển.
- Không sửa gstack/n8n hoặc logic/bảng size. Không gửi tin khách. Không xóa thay đổi ngoài phạm vi.

## Đã triển khai và kiểm tra

### Điều tra sau khi Nam cấu hình nguồn, 27/10/2026

- POSCake đã được bật; lỗi nguồn, giới hạn phân trang hội thoại và 429 khiến dữ liệu ban đầu không xuất hiện. Màn workspace root cũng mở dashboard B2B thay vì care. Đã sửa đường vào care, hiển thị trạng thái nguồn, chấp nhận SKU null và giữ nguyên SKU có giá trị.
- POS trả `fb_id` gồm page và customer ID. Đã sửa ghép theo đúng page, kiểm tra ID hội thoại và tin nhắn. Một phép đối chiếu GET-only nguồn thật khớp POS → Pancake → message feed; không ghi log ID, tin hoặc khóa.
- Webhook thật có event `customers`; bản cũ nhầm thành đơn. Event mới được acknowledge mà không đưa vào order queue; pending cũ có loại đã biết chuyển `IGNORED` mà không gọi POS. Các receipt `FAILED` được giữ nguyên, không tự replay/reset.
- Tại lúc kiểm tra: 494 khách, 633 đơn, 387 đơn có bằng chứng giao thành công, 12 hội thoại UMEHA đã xác minh, 0 khách enrolled, 0 template được duyệt. Đây là snapshot, không phải pilot hoặc kết quả chăm sóc khách.
- UMEHA có lượt nguồn thành công. Li En Sport vẫn báo `PANCAKE_PAGINATION_INCOMPLETE`; đơn đã nhập nhưng chăm sóc chủ động vẫn bị chặn. 429 dùng backoff; không bỏ guard hoặc đẩy watermark khi scan chưa đầy đủ.
- LLM phiên bản 7 đã vượt text probe, nhưng chưa bật. OpenRouter ghi model NVIDIA free này không hỗ trợ ép JSON schema và khuyến cáo không gửi dữ liệu cá nhân/mật. Chưa thử agent với dữ liệu khách thật.
- Regression: 51 ca/134 assertions source/validation/proxy; 11 ca/66 assertions webhook/integration; typecheck 11 task, lint và anti-slop đạt. Bản web, API và worker đã build/deploy bằng PM2; heartbeat vẫn PAUSED.

### Bản hiện tại: nguồn trên app và trợ lý AI, 27/10/2026

- Đã triển khai `/crm-thu-nghiem-umeha/settings/connections/poscake`, `/settings/care-ai` và `/care` → Trợ lý AI. Đường dẫn thứ hai/thứ ba cũng có workspace slug.
- Runtime dùng `crm_care_staging`, tạo mới và áp dụng migration. Giữ tài khoản owner và session còn hạn; không sao chép khách, template, chính sách hoặc cấu hình demo. Demo cũ vẫn ở `crm_care_demo_test`.
- Khóa mã hóa nằm trong root `.env` bị ignore. Sau QA cleanup: 1 user, 0 khách, 0 template, 0 integration, 0 AI job. Chưa nhập khóa nguồn/model thật.
- Bốn process CRM online: web, API, care-worker, care-agent. Tunnel giữ nguyên hostname; demo refresh stopped; PM2 saved. Reboot và hostname production chưa chứng nhận.
- API 470 ca/1.205 assertions; web 236 ca/534 assertions; source + care-agent 18 ca/74 assertions đạt. Typecheck 11 task, lint 10 task, anti-slop 0 lỗi; audit 0 trên 1.075 package. Bốn build đạt. Suite research agent có lỗi baseline ở phần lịch sử chưa chạy lại.
- Browser lưu cấu hình bằng khóa giả, xác minh trường khóa trống sau lưu, lấy URL/header webhook và chỉ đo độ dài khóa. Không request check nguồn/model bằng khóa giả; cleanup có guard theo owner/version/tên/model.
- POSCake/AI/assistant không tràn ở 360/412/1280px; pageerror và console error 0. Đây là Chromium mô phỏng, chưa phải Android thật.
- HTTP webhook: 202 hợp lệ, replay không nhân đôi, JSON hỏng 400, quá dung lượng 413. Native POS GET-only xác nhận list không luôn có page_number, get trả data:order. App sync/webhook/model thật chưa chứng nhận.
- Review độc lập cuối PASS sau sửa AI check NULL, chặn paid retry sau gián đoạn và clock mới cho từng receipt. Không gửi tin, tự enroll, tự duyệt chính sách/template hoặc sửa size.
- Heartbeat PAUSED. Tiếp tục thủ công không bật lại lịch. E/F: technical-pass-live-certification-pending.

### Lịch sử bản demo trước khi tách staging, 27/10/2026

- URL HTTPS tạm: https://essentially-athens-acdbentity-fed.trycloudflare.com . Mở root để đăng nhập; slug hiện tại được chuẩn hóa thành `crm-thu-nghiem-umeha` khi tạo session.
- Tài khoản owner của Nam được cấp bằng CLI, mật khẩu scrypt hash, không xác nhận email giả. Thông tin đăng nhập nằm riêng trong `.scratch/TEST-ACCESS.md` bị ignore; không đưa vào log, Git hoặc PR.
- Bật cả `CRM_CARE_MODE` và `CRM_CARE_PASSWORD_AUTH`. Không mở signup công khai. Danh sách email cho phép được kiểm tra lại khi tạo care session.
- Browser phiên sạch đăng nhập qua URL công khai, nhận việc và chuẩn bị/copy được. Cookie Secure/HttpOnly/SameSite=Lax. Không session trả 401; signup trả 400. Bốn tab không lỗi console; viewport 360/390/412 không tràn.
- Có chín hồ sơ tổng hợp, gồm hai ứng viên chưa enroll. Bốn công việc mẫu giao cho Nam. Copy giữ số xác nhận gửi mẫu ở 2; xem trước ứng viên trả 1/1 đủ điều kiện và không đổi số khách/enrollment/task/event/xác nhận.
- Năm process PM2 đang chạy: ba process CRM, `crm-test-tunnel`, `crm-demo-source-refresh`; đã `pm2 save`. Tunnel tạm không bảo đảm hostname sau restart. Chưa kiểm tra phục hồi sau reboot host/container.
- Job nguồn mẫu chỉ cập nhật metadata cho ID `demo-` thuộc `demo-shop` trong `crm_care_demo_test`, không reset thao tác người test. Không dùng hoặc chuyển job này sang dữ liệu thật. Không chạy lại seed/reset demo khi Nam đang test.
- API 460 test đạt; app 236 test đạt; bộ đăng nhập/SSO riêng 19 ca/36 assertions. Kiểu 11 task, lint/anti-slop và ba build đạt. Suite toàn repo mới có lỗi ở `agent/retireExhausted`: limit 2 trả 3, tái hiện hai lần trong file baseline không sửa. Không khẳng định toàn repo hiện xanh; research agent không được triển khai cho bản test này.
- Review bổ sung sửa race cấp mật khẩu đồng thời bằng advisory lock theo email chuẩn hóa. Hai CLI đồng thời chỉ tạo một credential. Review độc lập đã kiểm lại và PASS.
- Bản test không thay thế D02/D03. Ba nhân viên thật, chính sách, nguồn runtime, Android thật và pilot quan sát vẫn chưa nghiệm thu. Hướng dẫn: TESTING.md.

- Hai migration: customer care và sync state; bảy model, khóa theo khách/đơn/mốc, event append-only.
- API có session, quyền quản lý, phân công, claim/copy/xác nhận, template theo tag/phiên bản/duyệt/hết hạn, trạng thái hỗ trợ và đối soát.
- Worker không dùng AI để tạo từng tin; lịch D+1/5/12/30/60/90 lúc 09:00 VN, khoảng nghỉ 7 ngày, dừng sau hai lần im lặng, chống replay và nhắc bù dồn.
- Adapter GET-only POS/Pancake; exact SKU; delivery history status=3; conversation v2 cursor và messages v1. Có lease, backoff 429, watermark chỉ tiến khi đầy đủ, refresh riêng khách pilot có đơn cũ.
- UI bốn tab: hôm nay, khách hàng, nội dung, hiệu quả; copy với vùng chọn thủ công; không có đường tự gửi. Mẫu đúng tag ưu tiên hơn mẫu chung mới hơn.
- C07 đã có báo cáo kết quả 30 ngày theo nhân viên, số khách đã kiểm tra hội thoại và tin đến sau xác nhận gần nhất, tách khỏi cohort mua lại. Output metrics có schema rõ; danh sách khách chỉ trả trường cần dùng và số lượng đơn/hội thoại, tránh JSON nguồn dư thừa và lỗi type recursion.
- Đã sửa sai selector Radix khiến tabs xếp ngang/tràn vùng main; bốn tab không tràn ở 360px, queue không tràn ở 360/390/412px.
- Walkthrough dữ liệu mẫu: copy giữ 0 xác nhận; nhân viên bấm xác nhận thì tăng 1 và việc rời queue.
- 24 template nháp, chỉ hai template DEMO được duyệt trong database demo; không có ưu đãi thật tự đặt.
- Quản lý chọn rõ 1–100 khách ở tab Khách hàng để xem trước pilot. Báo cáo chỉ đọc kiểm tra nguồn, người phụ trách, đơn giao, mốc và mẫu đúng tag; không enroll, tạo task hoặc trả nội dung gửi.
- Mốc trước tại `6b89490`: toàn repo 1.390 test đạt. Kết quả mới nhất của bản test và lỗi agent kế thừa nằm ở phần trên; không dùng mốc cũ để kết luận toàn repo hiện đạt. CRM riêng 43 ca/153 assertions vẫn đạt; xem VALIDATION.md.

## Môi trường thử nghiệm cục bộ

- Bun chính xác 1.4.0: `.scratch/tooling/bun-linux-x64/bun`; không dùng Bun 1.3.14 cũ trong PATH để cập nhật lockfile.
- Database `crm_care_demo_test`: chín khách mẫu, ba nhân viên mẫu, quản lý mẫu và tài khoản test owner của Nam. Database `crm_care_test`: test riêng; có dữ liệu demo từ lượt phát triển trước nên không dùng để chạy toàn bộ test membership. Database `crm_care_ci_test`: suite toàn repo, tách demo. Chỉ ghi/xóa fixtures do test sở hữu.
- Root `.env` và session demo chỉ nằm trong đường dẫn bị Git ignore. Không in file/cookie/token.
- PM2 nằm trong `.scratch/ops/node_modules/pm2`, dùng PM2_HOME `.scratch/pm2` tách biệt. Web 3210, API 3211; HTTPS proxy tự ký 3213 chỉ dành cho browser test trong container, chưa phải URL điện thoại hoặc production.
- Ba process: crm-web, crm-api, crm-care-worker. API/worker chạy binary Bun trực tiếp với interpreter:none để tránh require() async ESM của PM2.
- Browser CLI session `crm`, chạy từ `.scratch/ops`. Config/session file trong `.scratch`, Chromium headless. Ảnh ở `output/playwright` bị ignore.
- Sinh tRPC: binary upstream cần GLIBC 2.39; container 2.36. Đã chạy binary qua isolated loader `.scratch/tooling/glibc/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`, library-path cùng thư mục; không sửa libc hệ thống. Sau codegen chạy `bun run check-types -- --only --concurrency=2`.
- `.scratch/final-results.json` và `final-*` hiện lưu lượt toàn repo có lỗi agent và lỗi kiểu trước sửa. Dùng `access-final-api-tests.log`, `access-app-tests.log`, `access-types-final.log`, `access-final-lint.log`, `access-slop-final.log` và `access-build-results.json` cho kết quả bản test cuối. Không suy ra toàn repo xanh từ các log cũ.

## Việc tiếp theo

1. Đã kiểm tra phân trang lặp, tổng trang đổi, trang cuối rỗng, cursor hội thoại lặp và lease bị thay. Cân nhắc đối soát định kỳ sau chứng nhận nguồn thật; nguồn runtime vẫn chưa có credentials trong app. Không sửa cursor/claim của hệ thống n8n hiện tại.
2. Theo dõi PR nháp #1 và CI nếu có check-run mới. Không merge hoặc coi toàn bộ A–D hoàn tất từ code/test; các điều kiện vận hành nằm ở D02/D03.
3. Code đã lưu commit riêng file CRM. `git diff --numstat` phản ánh thay đổi thực, còn `git status` có thể liệt kê file không đổi vì mount/CRLF. Không `add -A`, restore/reset toàn repo; không đưa `.env`, cookie, ảnh/log thử nghiệm hoặc dữ liệu khách thật lên Git. Hai migration đã áp dụng có dòng trắng cuối file; tránh sửa checksum chỉ để dọn whitespace trong các database test đã tạo.
4. Khi có cấu hình server/auth/token nguồn và chính sách đã duyệt: chứng nhận sync trực tiếp, triển khai HTTPS, đăng nhập ba nhân viên, chọn rõ 50–100 khách pilot; không mặc nhiên enroll khách thật.
5. Quan sát pilot khoảng hai tuần với Android thật rồi mới nghiệm thu D03.

## Review bổ sung 27/10/2026

- Đã sửa lease hết hạn/đổi chủ bằng fencing trong transaction, kiểm tra token trước mỗi import và giữ trạng thái nguồn đến khi hoàn tất. Nguồn lỗi/in-flight/chưa có lượt đầy đủ chặn claim/copy/xác nhận. Thiếu credentials không bỏ qua lịch sử nguồn lỗi đã lưu.
- Giữ thời điểm tin đến/đi tăng dần; replay phản hồi đã xử lý không mở lại. Chủ khách/quản lý xử lý phản hồi/hỗ trợ từ tab Khách hàng ngay cả khi chưa có task.
- Xử lý phản hồi so khớp thời điểm đã xem dưới khóa khách; phản hồi mới làm thao tác cũ bị từ chối. Đóng WAITING ISSUE/REPLIED tương ứng, giữ lời hẹn, opt-out và yêu cầu đối soát.
- Duyệt/thu hồi template so khớp version; UI nhận lại việc cập nhật version để xác nhận không bị lỗi sau copy.
- Review độc lập đã kiểm lại các sửa lỗi này, không còn finding trong phạm vi review. Chi tiết: REVIEW.md.
- 15 lỗ hổng dependency đã tồn tại ở baseline. Đã vá bằng override cùng major; bun audit hiện 0 trên 1.074 package. Toàn repo sau vá: 1.387 test đạt, 11 task typecheck đạt sau codegen, lint/anti-slop và ba build đạt.
- Browser 360px: xử lý khách mẫu chưa có task không tăng số lần gửi; copy → nhận lại → xác nhận thành công, bộ đếm mẫu 1→2; không gửi tin thật, không tràn ngang, console không lỗi.
- Demo hiện có thêm một khách mẫu phản hồi, đã xử lý qua UI; không tính là pilot. Sau cùng các DB và log vẫn chỉ là môi trường test.

## Xem trước pilot bổ sung 27/10/2026

- Báo cáo chỉ cho quản lý, yêu cầu danh sách ID tường minh, duy nhất, từ 1 đến 100 khách. Không tự chọn khách hoặc thay đổi enrollment.
- Dùng cùng quy tắc chọn template với đường copy. Chỉ trả tên/phiên bản mẫu đã duyệt, mốc và các lý do chưa đủ điều kiện; không trả nội dung tin.
- Mốc từng có công việc, kể cả đã hủy khi dừng pilot, được báo cần kiểm tra lịch sử. Không hiển thị sẵn sàng khi khóa chống trùng không cho tạo lại.
- Review độc lập kiểm lại sửa lỗi trên. Ba ca mới kiểm tra quyền, nguồn lỗi, đơn mới chưa giao, giới hạn chọn và báo cáo không ghi dữ liệu.
- Browser 360px: chọn một khách mẫu đã trong pilot trả 0/1 đủ điều kiện và đúng lý do. Document/main đều 360px, console 0 lỗi. Trước/sau giữ nguyên 7 khách, 7 enrollment, 7 task, 56 event và 2 xác nhận gửi mẫu.
- Mốc preview trước khi thêm đăng nhập mật khẩu: `.scratch/pilot-verification.json` có checks, audit và ba build exit 0; `.scratch/pilot-tests.log` có 43 ca/153 assertions. Kết quả sau triển khai test nằm ở đầu checkpoint. Không cần chạy lại suite khi chỉ thay tài liệu.
- D02 vẫn cần nguồn runtime, chính sách, đăng nhập nhân viên và danh sách thật. D03 chưa bắt đầu; không có tin khách thật nào được gửi.

## E/F additions awaiting validation

E01–E03 and F01–F03 are `technical-pass-live-certification-pending`. The staging app includes source settings, the durable POSCake webhook inbox and the care AI worker. See the current evidence above and [SETTINGS-AND-WEBHOOK.md](SETTINGS-AND-WEBHOOK.md).

Current E/F technical evidence is recorded in VALIDATION.md. Real source/model probes, production acceptance and observed pilot remain pending.

## Heartbeat

ID `ho-n-t-t-crm-ch-m-s-c-kh-ch-a-d` is PAUSED at Nam's request. Continue authorized work manually. A general “TIẾP” instruction does not resume this schedule. Resume the heartbeat only after Nam explicitly requests resuming it. D02/D03 acceptance remains open.
