# Review trước khi đưa CRM lên fork

Ngày: 27/10/2026. Baseline: `711c909cf016e738c5b2e9418310485ad67bee47`.

## Kết quả kỹ thuật

Review độc lập chỉ đọc source, không sửa file hoặc gọi nguồn khách hàng. Các lỗi được sửa và kiểm lại:

1. Đồng bộ dở dang không được làm hồ sơ đủ điều kiện liên hệ. API kiểm tra trạng thái nguồn đã lưu, gồm lỗi, lượt đang chạy và lần hoàn tất gần nhất.
2. Worker cũ không được ghi sau khi mất lease. Token, scope và thời hạn được kiểm tra trong transaction trước khi ghi; mỗi import có kiểm tra sở hữu mới.
3. Trang POS/hội thoại lặp hoặc số trang thay đổi không được tiến watermark. Có test thành công nhiều trang và các nhánh thất bại.
4. Phản hồi đã xử lý không được mở lại do replay. Thời điểm hoạt động được giữ tăng dần; chỉ inbound mới mở lại.
5. Khách có phản hồi trước khi có task có đường xử lý ở hồ sơ. Chủ khách hoặc quản lý phải ghi kết quả. Hệ thống không coi thao tác này là gửi tin.
6. Xử lý T1 không được xóa phản hồi T2 đến sau đó. API so khớp timestamp đã xem dưới khóa khách, cho cả hồ sơ và hành động task.
7. Xử lý hỗ trợ ở hồ sơ đóng các task WAITING ISSUE/REPLIED. Lời hẹn, opt-out và yêu cầu đối soát được giữ.
8. Quản lý không được duyệt nội dung đã đổi sau khi mở màn hình. Duyệt/thu hồi kiểm tra version nguyên tử.
9. Nhận lại việc sau copy cập nhật version phía UI. Xác nhận sau nhận lại đã kiểm tra bằng browser.

Kết quả cuối: 43 ca CRM/153 assertions, 1.390 test toàn repo đạt; typecheck sau codegen, lint, anti-slop và ba build đạt. Các ca là dữ liệu tổng hợp. Các yêu cầu nguồn thật, nhân viên thật, Android thật và pilot vẫn mở.

Review bản xem trước pilot phát hiện mốc đã có task bị hủy vẫn hiển thị đủ điều kiện. Đã sửa để kiểm tra toàn bộ lịch sử công việc của mốc, giữ khóa chống trùng. Review độc lập kiểm lại sửa lỗi và không còn finding trong phạm vi này. Báo cáo chỉ đọc yêu cầu quản lý chọn rõ 1–100 khách; test xác nhận không đổi enrollment, task hoặc event.

## Dependency audit

Các phiên bản có advisory đều đã xuất hiện trong lockfile baseline. Chỉ đổi override/lockfile liên quan, giữ cùng major:

| Dependency | Bản vá dùng | Nguồn chính |
|---|---|---|
| body-parser | 2.4.0 | https://github.com/advisories/GHSA-27r3-jxmh-p828 |
| multer | 2.5.0 | https://github.com/advisories/GHSA-q7qp-rjg7-q26m |
| fast-uri | 3.1.9 | https://github.com/advisories/GHSA-w74x-v6f9-j3xg |
| undici | 6.29.1 / 7.30.1 / 8.12.2 theo dependency cha | https://github.com/advisories/GHSA-xjj6-f33q-929c |
| zod, bản nested của @vercel/cli-config | 4.6.7 | https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 |

Trước vá: 15 advisory, gồm 6 high. Sau vá: `bun audit` không tìm thấy lỗ hổng trong 1.074 package. Kiểm thử toàn repo và build sau thay đổi dependency đã đạt. Không gọi đây là kiểm thử bảo mật toàn hệ thống.

## Quét dữ liệu trước xuất bản

Quét diff thay đổi bằng gstack-redact. Scanner gắn nhầm hai Facebook page ID và IP trong đường dẫn workspace thành số điện thoại. Đây là định danh kỹ thuật đã kiểm tra, không phải dữ liệu khách. Chỉ ba chuỗi đó được allowlist cục bộ. URL postgres mặc định chỉ xuất hiện trong context không đổi của `.env.example`; phần thêm mới không chứa URL bí mật đó. Quét phần thay đổi sau phân loại không còn HIGH/MEDIUM. Không đưa `.env`, cookie, session, log hoặc ảnh test vào Git.

## Trạng thái phát hành

Bổ sung bản test HTTPS: review mật khẩu care không có finding khác sau khi sửa race CLI bằng advisory lock theo email. Password auth cần hai cờ, signup đóng, allow-list kiểm tra session mới. Công cụ cấp tài khoản không ghi đè mật khẩu/role hiện có. Kiểm thử hai CLI đồng thời chỉ tạo một credential.

Lượt toàn repo mới có lỗi `agent/retireExhausted` ở mã baseline không sửa: giới hạn 2 trả 3. Chưa sửa hoặc kết luận nguyên nhân đầy đủ. API/web và luồng chăm sóc được kiểm tra riêng; research agent không chạy ở bản test. Không dùng kết quả 1.390 test trước đây để tuyên bố HEAD mới xanh toàn repo.

Đây là bản để review trên fork. Không merge vào production hoặc đánh dấu A–D hoàn tất từ kết quả kỹ thuật. Repo dùng Conventional Commit và release-please; giữ phiên bản/title theo quy trình repo, không tự đổi sang version bốn thành phần của gstack. Lượt push dùng kết quả kiểm tra từ container Linux thay cho chạy lại hook trên máy Windows; giới hạn GLIBC của codegen được ghi tại VALIDATION.md. Không coi hook gốc là đã đạt.
