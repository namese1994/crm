# Checkpoint CRM A–D

Cập nhật: 27/10/2026, Asia/Ho_Chi_Minh. Đọc cùng BACKLOG.md, SOURCE-CONTRACTS.md, SCENARIOS.md và VALIDATION.md.

## Repo và phạm vi

- Fork: https://github.com/namese1994/crm, branch `codex/customer-care`.
- Baseline upstream main: `711c909cf016e738c5b2e9418310485ad67bee47`.
- Commit triển khai cục bộ: `f81fab7` (49 file của CRM); chưa push remote hoặc mở PR.
- Windows: `\\100.104.251.126\Documents\AI_Workspace\apps\crm` (alias cũ Y:\AI_Workspace\apps\crm).
- Linux cùng file: `/workspace/apps/crm`, qua nam-mcp workspace runner, container phát triển.
- Không sửa gstack/n8n hoặc logic/bảng size. Không gửi tin khách. Không xóa thay đổi ngoài phạm vi.

## Đã triển khai và kiểm tra

- Hai migration: customer care và sync state; bảy model, khóa theo khách/đơn/mốc, event append-only.
- API có session, quyền quản lý, phân công, claim/copy/xác nhận, template theo tag/phiên bản/duyệt/hết hạn, trạng thái hỗ trợ và đối soát.
- Worker không dùng AI để tạo từng tin; lịch D+1/5/12/30/60/90 lúc 09:00 VN, khoảng nghỉ 7 ngày, dừng sau hai lần im lặng, chống replay và nhắc bù dồn.
- Adapter GET-only POS/Pancake; exact SKU; delivery history status=3; conversation v2 cursor và messages v1. Có lease, backoff 429, watermark chỉ tiến khi đầy đủ, refresh riêng khách pilot có đơn cũ.
- UI bốn tab: hôm nay, khách hàng, nội dung, hiệu quả; copy với vùng chọn thủ công; không có đường tự gửi. Mẫu đúng tag ưu tiên hơn mẫu chung mới hơn.
- C07 đã có báo cáo kết quả 30 ngày theo nhân viên, số khách đã kiểm tra hội thoại và tin đến sau xác nhận gần nhất, tách khỏi cohort mua lại. Output metrics có schema rõ; danh sách khách chỉ trả trường cần dùng và số lượng đơn/hội thoại, tránh JSON nguồn dư thừa và lỗi type recursion.
- Đã sửa sai selector Radix khiến tabs xếp ngang/tràn vùng main; bốn tab không tràn ở 360px, queue không tràn ở 360/390/412px.
- Walkthrough dữ liệu mẫu: copy giữ 0 xác nhận; nhân viên bấm xác nhận thì tăng 1 và việc rời queue.
- 24 template nháp, chỉ hai template DEMO được duyệt trong database demo; không có ưu đãi thật tự đặt.
- Toàn repo 1.387 test đạt, 0 lỗi (một phần cache package không đổi); CRM riêng 40 ca/133 assertions; lint và anti-slop đạt; kiểm tra kiểu 11 task sau sinh mã đạt; ba build đạt. Xem giới hạn codegen trong VALIDATION.md.

## Môi trường thử nghiệm cục bộ

- Bun chính xác 1.4.0: `.scratch/tooling/bun-linux-x64/bun`; không dùng Bun 1.3.14 cũ trong PATH để cập nhật lockfile.
- Database `crm_care_demo_test`: demo tổng hợp, ba nhân viên mẫu và một quản lý, sáu khách mẫu. Database `crm_care_test`: test riêng; có dữ liệu demo từ lượt phát triển trước nên không dùng để chạy toàn bộ test membership. Database `crm_care_ci_test`: suite toàn repo, tách demo. Chỉ ghi/xóa fixtures do test sở hữu.
- Root `.env` và session demo chỉ nằm trong đường dẫn bị Git ignore. Không in file/cookie/token.
- PM2 nằm trong `.scratch/ops/node_modules/pm2`, dùng PM2_HOME `.scratch/pm2` tách biệt. Web 3210, API 3211; HTTPS proxy tự ký 3213 chỉ dành cho browser test trong container, chưa phải URL điện thoại hoặc production.
- Ba process: crm-web, crm-api, crm-care-worker. API/worker chạy binary Bun trực tiếp với interpreter:none để tránh require() async ESM của PM2.
- Browser CLI session `crm`, chạy từ `.scratch/ops`. Config/session file trong `.scratch`, Chromium headless. Ảnh ở `output/playwright` bị ignore.
- Sinh tRPC: binary upstream cần GLIBC 2.39; container 2.36. Đã chạy binary qua isolated loader `.scratch/tooling/glibc/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`, library-path cùng thư mục; không sửa libc hệ thống. Sau codegen chạy `bun run check-types -- --only --concurrency=2`.
- `.scratch/final-results.json` và `.scratch/final-{tests,lint,slop,types}.log` là lượt toàn repo đạt. Các log `ci-*` cũ có lỗi đã xử lý hoặc lỗi codegen môi trường; không dùng chúng thay lượt cuối.

## Việc tiếp theo

1. Đã kiểm tra phân trang lặp, tổng trang đổi, trang cuối rỗng, cursor hội thoại lặp và lease bị thay. Cân nhắc đối soát định kỳ sau chứng nhận nguồn thật; nguồn runtime vẫn chưa có credentials trong app. Không sửa cursor/claim của hệ thống n8n hiện tại.
2. Chuẩn bị đồng bộ branch đã kiểm thử lên fork để review, theo quy trình ship của repo; chưa push hoặc mở PR tại checkpoint này.
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

## Heartbeat

ID `ho-n-t-t-crm-ch-m-s-c-kh-ch-a-d`, mỗi 30 phút, ACTIVE. Không tạo trùng hoặc tắt khi mới xong code. Nếu chỉ còn phụ thuộc ngoài và không có bằng chứng mới, giữ yên lặng; không lặp lại full suite hoặc thông báo cùng một thiếu hụt mỗi lượt. Chỉ tắt khi mọi A–D có bằng chứng, gồm pilot thực tế.
