# Bằng chứng kiểm thử CRM

Kiểm tra ngày 27/10/2026, giờ Việt Nam. Đây là bằng chứng kỹ thuật trên dữ liệu giả lập, chưa phải nghiệm thu vận hành.

## Kết quả

### Điều tra kết nối thật, 27/10/2026

Nguồn POS trả một số SKU null. Sau sửa, mẫu đầu 50 đơn parse được 50/50; giá trị SKU null được giữ là null. Mã Facebook POS có tiền tố Page ID. Một đối chiếu chỉ đọc đã khớp order → đúng conversation → message feed, với kiểm tra danh tính; không lưu nội dung thô vào log.

Webhook quan sát được là event `customers`, không phải order. Bộ nhận hiện không xếp event này vào order queue. Worker nhận diện và đánh dấu pending cũ là `IGNORED`; không retry các receipt `FAILED`. Không cấu hình hoặc thay đổi webhook POSCake.

Regression source/validation/proxy: 51 ca/134 assertions. Integration/webhook: 11 ca/66 assertions. Typecheck 11 task, lint, anti-slop và các build liên quan đạt. Workspace root chuyển đến care; UI thể hiện nguồn bị chặn. Snapshot thực tế: 494 khách, 633 đơn, 12 hội thoại UMEHA xác minh, 0 enrolled, 0 template duyệt. Li En Sport vẫn chưa quét đủ hội thoại; không xác nhận sẵn sàng production hoặc pilot.

Model NVIDIA free trên OpenRouter đã trả lời text probe. Probe không chứng nhận tool calling/structured output. Tài liệu provider nêu model không hỗ trợ `response_format` và khuyến cáo không gửi dữ liệu mật/cá nhân. AI vẫn tắt; không gửi dữ liệu khách thật cho model.

### Bổ sung nguồn và AI đang chạy trên staging, 27/10/2026

| Kiểm tra | Bằng chứng hiện tại |
|---|---|
| API | 470 ca đạt, 1.205 assertions; gồm 10 ca cấu hình/webhook |
| Web | 236 ca đạt, 534 assertions |
| Source và care AI | 18 ca đạt, 74 assertions; model giả lập |
| Kiểu / lint / anti-slop | 11 task / 10 task đạt; anti-slop 0 cảnh báo và lỗi |
| Dependency | Audit 0 lỗ hổng trên 1.075 package |
| Build | API, care-worker, care-agent và Next production đạt; API build lại sau sửa 400/413 |
| HTTP | Webhook JSON hợp lệ 202; replay chống trùng; JSON hỏng 400; quá 256 KiB trả 413 |
| Browser | Lưu source/LLM bằng khóa giả; khóa trống sau lưu; không bật trước kiểm tra. URL/header webhook đúng; không log giá trị khóa |
| Responsive | Ba màn hình POSCake/AI/assistant không tràn ở 360/412/1280px; 0 pageerror/console error |
| Runtime | Staging mới, migration đầy đủ, giữ owner; 4 process CRM và tunnel online; demo refresh stopped; PM2 saved |
| Review | Độc lập read-only PASS sau sửa NULL claim, lease clock, interrupted paid check và 400/413 |

Log cục bộ bị ignore: `.scratch/integrations-final-results.json`, `integrations-final-*`, `integrations-build-results.json`, `integrations-http-final2.log`, `integrations-browser-*`. Cả 7 child check exit 0. Runner tổng chạm timeout sau khi ghi đủ kết quả; đã đọc lại từng kết quả/log, không suy ra pass từ timeout.

QA chỉ lưu hai cấu hình khóa giả ở trạng thái tắt, không request check, không gọi nguồn/model. Cleanup có guard owner/version/tên/model. Sau cleanup: 1 user, 0 khách/template/integration/job. Không nhập hoặc gửi tin khách thật.

Migration đã áp dụng có một dòng trắng cuối file. Giữ checksum đã triển khai; diff check bỏ riêng blank-at-eof và không phát hiện lỗi whitespace khác. Quét staged diff không có HIGH/MEDIUM/LOW/WARN; `.env`, khóa, mật khẩu, ảnh/log và build output đều bị ignore.

Native POS GET-only xác nhận list không luôn có page_number; parser vẫn kiểm mismatch khi có, tổng trang đổi và đơn lặp. Get trả `{success,data:order}`. App sync có credentials thật, webhook thật, model thật, Android thật, production và D02/D03 vẫn chưa chứng nhận.

### Các mốc trước bổ sung E/F

| Hạng mục | Kết quả | Giới hạn |
|---|---|---|
| Migration | Hai migration chăm sóc đã áp dụng trên Postgres test | Chưa áp dụng vào database vận hành |
| Bộ test toàn repo | Mốc `6b89490` đạt 1.390 ca; lượt triển khai test mới không đạt vì `agent/retireExhausted` | Limit 2 trả 3 ở file baseline không sửa; tái hiện hai lần; không chạy research agent trong bản test chăm sóc |
| CRM chuyên biệt | 43 ca đạt, 153 assertions | Gồm API/Postgres, quy tắc, mô phỏng API nguồn; chưa có token nguồn thật |
| Kiểm tra kiểu | 11 task đạt, gồm worker | Sinh tRPC bằng CLI thật trước, rồi chạy `check-types -- --only --concurrency=2` |
| Lint | Toàn repo đạt; anti-slop 0 cảnh báo, 0 lỗi | Biome còn cảnh báo ở mã upstream; không dùng kết quả này để khẳng định toàn repo không có cảnh báo |
| Build | Web production, API và worker thành công | Bản preview chạy trong container phát triển |
| PM2 | Web, API, worker chạy dưới ba process riêng | Chưa phải triển khai server vận hành hoặc thiết lập tự khởi động sau reboot |
| Authentication | API chăm sóc không có session trả 401 | Tài khoản demo không chứng minh ba nhân viên thật đăng nhập được |
| Mobile browser | Hôm nay không tràn ngang ở 360/390/412px; bốn tab không tràn ở 360px | Chromium mô phỏng viewport; chưa thử trên Android thật |
| Copy / ghi nhận gửi | Copy giữ số lần xác nhận ở 0; xác nhận thủ công tăng lên 1 và đóng việc | Chỉ thao tác với khách mẫu; không gửi Messenger, không chứng minh tin đã đến khách |
| Xem trước pilot | Quản lý chọn rõ 1–100 khách; báo cáo điều kiện không ghi enrollment, task hoặc event | Chỉ dữ liệu giả lập; chưa có danh sách pilot thật |
| Đăng nhập và SSO | 19 ca/36 assertions đạt, gồm năm ca mới cho password care | Tài khoản được cấp trước; không signup; chưa nghiệm thu ba nhân viên thật |
| Hồi quy bản test | API 460 test và app 236 test đạt; 11 task kiểu, lint/anti-slop và ba build đạt | Tách khỏi lỗi research-agent nêu trên; không khẳng định suite toàn repo hiện đạt |

## Các ca quan trọng đã có test

- D tính theo sự kiện giao thành công, lịch 09:00 giờ Việt Nam, bỏ mốc đã hết hạn.
- Không dùng thời điểm thanh toán, tạo hoặc cập nhật đơn làm ngày giao hàng.
- Replay, chạy lại worker và hai xác nhận đồng thời không tạo việc/gửi trùng.
- Giữ nguyên SKU kể cả khoảng trắng; danh tính tách theo thương hiệu/shop/khách.
- Template nháp, bị thu hồi, hết hạn, thiếu biến hoặc không còn khớp tag bị từ chối.
- Copy không tăng số lần gửi hoặc cập nhật lần liên hệ gần nhất.
- Đơn mới, hủy/hoàn hàng, khách trả lời, từ chối, cần hỗ trợ và kết quả chưa rõ dừng chuỗi phù hợp.
- Đối soát “đã gửi/chưa gửi” là thao tác riêng; lời hẹn của khách được giữ qua mốc hết hạn.
- API nền tảng từ chối vẫn cho chuẩn bị/copy thủ công; không sửa cờ hạn chế của nền tảng.
- 429 và lỗi phân trang giữ watermark, giải phóng lease và có backoff.
- Khách trong pilot có đơn cũ ngoài cửa sổ cập nhật vẫn được đọc lại đơn và hoạt động hội thoại.
- Thời điểm tin nhắn/xác minh trong tương lai bị từ chối; không lưu nội dung hội thoại nguồn.
- Care mode bỏ yêu cầu research key nhưng vẫn yêu cầu xác thực và thiết lập workspace.
- Mẫu có tag liên quan được ưu tiên hơn mẫu chung mới hơn; vẫn kiểm tra loại trừ và không dùng lại mẫu đã gửi.
- Báo cáo phản hồi chỉ đếm tin đến sau lần xác nhận gần nhất, công khai số khách chưa được kiểm tra và không tính khách chỉ copy vào nhóm đã xác nhận gửi.
- Xem trước pilot yêu cầu quyền quản lý và ID duy nhất; từ chối danh sách rỗng, quá 100 hoặc khách thiếu. Nguồn lỗi, đơn mới chưa giao và mốc đã có task đều chặn trạng thái sẵn sàng.
- Mốc có task đã hủy khi dừng pilot không được xem là trống. Dùng cùng quy tắc chọn mẫu đúng tag với copy, không trả nội dung tin trong báo cáo.

Sau restart cả ba process PM2, database demo giữ nguyên sáu việc: năm OPEN và một DONE; không tạo việc trùng. Báo cáo kết quả mới đã kiểm tra trên browser 360px, không tràn ngang, console không có lỗi.

## Lưu ý môi trường sinh tRPC

Binary `nestjs-trpc@2.13.0` của upstream cần GLIBC 2.39, còn container này có 2.36. Lệnh `bun run check-types` nguyên bản dừng ở bước codegen vì lý do đó. Đã chạy chính binary này qua dynamic loader GLIBC tách biệt trong `.scratch`, xác nhận tạo được 23 router/188 procedure ở lượt mới nhất, sau đó kiểm tra kiểu toàn bộ source thành công. Không sửa libc hệ thống, không thay binary sinh mã và không coi lệnh nguyên bản là đã đạt trong môi trường này. Khi chọn server build, ưu tiên môi trường có GLIBC 2.39 trở lên hoặc sinh mã trong môi trường build tương thích.

## Bằng chứng cục bộ

Các log trong `.scratch/final-results.json`, `.scratch/final-{tests,lint,slop,types}.log`, `.scratch/care-tests-final.log` và `.scratch/browser-*.log` được giữ cục bộ, không đưa lên Git. Ảnh viewport trong `output/playwright/care-mobile-{360,390,412}.png`. Không có cookie, token, nội dung khách thật trong tài liệu này.

Chưa chứng minh: đồng bộ xác thực trực tiếp, đủ lịch sử POS, chính sách/ưu đãi đã duyệt, đăng nhập nhân viên thật, thiết bị Android thật, triển khai HTTPS và pilot khoảng hai tuần. D02/D03 vẫn mở.

## Review và bảo mật bổ sung

Review độc lập phát hiện và đã kiểm lại các sửa lỗi về phân trang, lease, freshness nguồn, replay/ack phản hồi, duyệt version, nhận lại việc và mốc pilot đã có công việc. Bộ CRM có 43 ca/153 assertions; mốc preview trước password auth đạt 1.390 ca toàn repo. Bằng chứng mốc đó: `.scratch/pilot-verification.json` và `.scratch/pilot-tests.log`. Kết quả sau triển khai test nằm ở phần cuối; không dùng `final-results.json` hiện tại làm bằng chứng xanh cho mốc trước.

`bun audit` trước vá báo 15 advisory (6 high, 7 moderate, 2 low), đều có phiên bản liên quan trong baseline. Sau override cùng major, audit báo 0 trên 1.074 package. Xem REVIEW.md để biết phiên bản và nguồn advisory. Đây là kết quả dependency audit, không thay thế pentest hoặc chứng nhận vận hành.

Browser 360px kiểm tra thêm hai luồng dữ liệu mẫu: xử lý phản hồi từ hồ sơ không có task giữ nguyên bộ đếm gửi; copy, nhận lại và xác nhận tăng đúng một lần, không lỗi version. Vùng main và document đều rộng 360px, console không lỗi. Không có tin Messenger nào được gửi trong các thao tác này.

## Browser xem trước pilot

Quản lý chọn Khách mẫu 6, yêu cầu báo cáo và thấy 0/1 khách đủ điều kiện. Báo cáo nêu khách đã trong pilot, công việc chưa kết thúc và mốc đã có task. Mốc D+1, ngày giao, lịch và phiên bản mẫu DEMO hiển thị. Ở viewport 360px, document và main đều rộng 360px; console không lỗi hoặc cảnh báo.

So sánh số bản ghi trước/sau bằng truy vấn chỉ đọc: 7 khách, 7 enrollment, 7 task, 56 event, 2 xác nhận gửi mẫu đều không đổi. Không thao tác enroll, copy hoặc xác nhận trong lượt này. Ảnh `output/playwright/care-pilot-preview-360.png`; log `.scratch/pilot-browser-{report,width,console}.log` và `.scratch/pilot-{before,after}.json` bị Git ignore. Đây không phải pilot thực tế.

## Triển khai bản test HTTPS

Phiên trình duyệt sạch đăng nhập bằng tài khoản owner được cấp trước, qua hostname công khai. Cookie session dùng Secure, HttpOnly và SameSite=Lax. Request care không có session trả 401; public signup trả 400. Không bỏ CSRF, kiểm tra origin hoặc session.

Nhận việc và copy khách mẫu giữ số xác nhận ở 2, chỉ thêm hai event claim/copy. Có ô chọn nội dung khi clipboard không cho phép. Xem trước ứng viên mẫu B trả 1/1 đủ điều kiện, mốc D+1 và mẫu DEMO phiên bản 1; trước/sau giữ nguyên 9 khách, 7 enrollment, 7 task, 66 event và 2 xác nhận. Viewport 360/390/412 không tràn; bốn tab không lỗi console. Chưa có Android thật.

Review phát hiện hai CLI cấp mật khẩu đồng thời có thể tạo hai credential. Đã thêm khóa transaction theo email chuẩn hóa, trước lookup/insert. Regression kiểm tra hai child CLI: một thành công, một từ chối, đúng một credential; review độc lập PASS. Không thêm constraint vào bảng auth kế thừa.

Log mới: `.scratch/access-final-api-tests.log`, `access-app-tests.log`, `access-focused-error.log`, `access-types-final.log`, `access-final-lint.log`, `access-slop-final.log`, `access-build-results.json` và `access-browser-*`. Các file này bị ignore. Không coi log `access-types.log` cũ có phần dư từ lượt lỗi trước là kết quả cuối. Không đưa credential/cookie/ảnh test lên Git.

Giới hạn hiện tại: Cloudflare Quick Tunnel tạm, không SLA hoặc hostname cố định; chưa thử reboot host/container; dữ liệu mẫu, nguồn thật và pilot chưa nghiệm thu. Lỗi `agent/retireExhausted` của suite toàn repo còn mở, không sửa ngoài phạm vi chăm sóc. Research agent không chạy trong bản triển khai này.
