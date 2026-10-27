# Checkpoint CRM A–D

Cập nhật: 27/10/2026, Asia/Ho_Chi_Minh. Đọc cùng BACKLOG.md, SOURCE-CONTRACTS.md, SCENARIOS.md và VALIDATION.md.

## Repo và phạm vi

- Fork: https://github.com/namese1994/crm, branch `codex/customer-care`.
- Baseline upstream main: `711c909cf016e738c5b2e9418310485ad67bee47`.
- Commit nền triển khai: `f81fab7`; bản vá dependency: `04182b1`; bản sửa review: `78f59bc`; đồng bộ tài liệu: `5e0fb40`.
- Nhánh đã push lên fork. PR nháp: https://github.com/namese1994/crm/pull/1, base `main`. Chưa merge hoặc triển khai production.
- Windows: `\\100.104.251.126\Documents\AI_Workspace\apps\crm` (alias cũ Y:\AI_Workspace\apps\crm).
- Linux cùng file: `/workspace/apps/crm`, qua nam-mcp workspace runner, container phát triển.
- Không sửa gstack/n8n hoặc logic/bảng size. Không gửi tin khách. Không xóa thay đổi ngoài phạm vi.

## Đã triển khai và kiểm tra

### Bản test truy cập được, 27/10/2026

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

## Heartbeat

ID `ho-n-t-t-crm-ch-m-s-c-kh-ch-a-d`, mỗi 30 phút, ACTIVE. Không tạo trùng hoặc tắt khi mới xong code. Nếu chỉ còn phụ thuộc ngoài và không có bằng chứng mới, giữ yên lặng; không lặp lại full suite hoặc thông báo cùng một thiếu hụt mỗi lượt. Chỉ tắt khi mọi A–D có bằng chứng, gồm pilot thực tế.
