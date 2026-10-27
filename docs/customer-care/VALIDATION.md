# Bằng chứng kiểm thử CRM

Kiểm tra ngày 27/10/2026, giờ Việt Nam. Đây là bằng chứng kỹ thuật trên dữ liệu giả lập, chưa phải nghiệm thu vận hành.

## Kết quả

| Hạng mục | Kết quả | Giới hạn |
|---|---|---|
| Migration | Hai migration chăm sóc đã áp dụng trên Postgres test | Chưa áp dụng vào database vận hành |
| Bộ test toàn repo | 1.390 ca đạt, 0 lỗi; 12 task Turbo thành công | Chạy tuần tự trên `crm_care_ci_test`; có cache của các package không đổi |
| CRM chuyên biệt | 43 ca đạt, 153 assertions | Gồm API/Postgres, quy tắc, mô phỏng API nguồn; chưa có token nguồn thật |
| Kiểm tra kiểu | 11 task đạt, gồm worker | Sinh tRPC bằng CLI thật trước, rồi chạy `check-types -- --only --concurrency=2` |
| Lint | Toàn repo đạt; anti-slop 0 cảnh báo, 0 lỗi | Biome còn cảnh báo ở mã upstream; không dùng kết quả này để khẳng định toàn repo không có cảnh báo |
| Build | Web production, API và worker thành công | Bản preview chạy trong container phát triển |
| PM2 | Web, API, worker chạy dưới ba process riêng | Chưa phải triển khai server vận hành hoặc thiết lập tự khởi động sau reboot |
| Authentication | API chăm sóc không có session trả 401 | Tài khoản demo không chứng minh ba nhân viên thật đăng nhập được |
| Mobile browser | Hôm nay không tràn ngang ở 360/390/412px; bốn tab không tràn ở 360px | Chromium mô phỏng viewport; chưa thử trên Android thật |
| Copy / ghi nhận gửi | Copy giữ số lần xác nhận ở 0; xác nhận thủ công tăng lên 1 và đóng việc | Chỉ thao tác với khách mẫu; không gửi Messenger, không chứng minh tin đã đến khách |
| Xem trước pilot | Quản lý chọn rõ 1–100 khách; báo cáo điều kiện không ghi enrollment, task hoặc event | Chỉ dữ liệu giả lập; chưa có danh sách pilot thật |

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

Review độc lập phát hiện và đã kiểm lại các sửa lỗi về phân trang, lease, freshness nguồn, replay/ack phản hồi, duyệt version, nhận lại việc và mốc pilot đã có công việc. Bộ CRM hiện có 43 ca/153 assertions; bộ toàn repo có 1.390 ca đạt. Lượt mới nhất sau bản xem trước pilot cũng đạt, xem `.scratch/pilot-verification.json`, `.scratch/final-results.json` và `.scratch/pilot-tests.log`.

`bun audit` trước vá báo 15 advisory (6 high, 7 moderate, 2 low), đều có phiên bản liên quan trong baseline. Sau override cùng major, audit báo 0 trên 1.074 package. Xem REVIEW.md để biết phiên bản và nguồn advisory. Đây là kết quả dependency audit, không thay thế pentest hoặc chứng nhận vận hành.

Browser 360px kiểm tra thêm hai luồng dữ liệu mẫu: xử lý phản hồi từ hồ sơ không có task giữ nguyên bộ đếm gửi; copy, nhận lại và xác nhận tăng đúng một lần, không lỗi version. Vùng main và document đều rộng 360px, console không lỗi. Không có tin Messenger nào được gửi trong các thao tác này.

## Browser xem trước pilot

Quản lý chọn Khách mẫu 6, yêu cầu báo cáo và thấy 0/1 khách đủ điều kiện. Báo cáo nêu khách đã trong pilot, công việc chưa kết thúc và mốc đã có task. Mốc D+1, ngày giao, lịch và phiên bản mẫu DEMO hiển thị. Ở viewport 360px, document và main đều rộng 360px; console không lỗi hoặc cảnh báo.

So sánh số bản ghi trước/sau bằng truy vấn chỉ đọc: 7 khách, 7 enrollment, 7 task, 56 event, 2 xác nhận gửi mẫu đều không đổi. Không thao tác enroll, copy hoặc xác nhận trong lượt này. Ảnh `output/playwright/care-pilot-preview-360.png`; log `.scratch/pilot-browser-{report,width,console}.log` và `.scratch/pilot-{before,after}.json` bị Git ignore. Đây không phải pilot thực tế.
