# Test bản chăm sóc

Đây là bản test HTTPS với dữ liệu tổng hợp. Chưa đồng bộ khách/đơn/hội thoại thật.
Đường dẫn hiện tại nằm trong CHECKPOINT.md. Thông tin đăng nhập được cấp riêng, không lưu trong Git.

## Ba luồng nên thử

1. **Hôm nay:** nhận một việc mẫu, chọn **Chuẩn bị và copy**. Khi clipboard không cho phép, chọn nội dung trong ô để copy thủ công. Copy không xác nhận đã gửi. Chỉ ghi kết quả trên khách mẫu khi chủ động thử bước xác nhận.
2. **Khách hàng:** chọn **Ứng viên mẫu A/B** rồi **Xem trước điều kiện**. Báo cáo hiển thị mốc, mẫu, độ mới nguồn và lý do chặn. Việc xem trước không enroll. Hai ứng viên mẫu chưa được đưa vào pilot; thao tác đưa vào phải do người test chọn rõ ở hồ sơ.
3. **Nội dung / Hiệu quả:** xem mẫu theo thương hiệu/tag, thử lưu nháp và duyệt bằng quyền quản lý. Kiểm tra báo cáo tách copy khỏi xác nhận gửi. Số liệu mẫu không chứng minh hiệu quả kinh doanh.

## Trạng thái mẫu

- Có chín hồ sơ tổng hợp. Bốn công việc được giao cho tài khoản test của Nam; một việc đã được kiểm tra tới bước copy, chưa xác nhận.
- Hai mẫu có chữ DEMO đã được duyệt trong database test. Những nội dung khác vẫn là nháp. Đây không phải duyệt chính sách kinh doanh thật.
- Nguồn mẫu được làm mới metadata định kỳ trong database `crm_care_demo_test`. Job này chỉ chấp nhận database đó, shop `demo-shop` và ID bắt đầu `demo-`. Không dùng job này cho vận hành thật.
- Link Pancake dùng ID minh họa. Luồng mở hội thoại thật cần chứng nhận nguồn trước.
- Bản test dùng Cloudflare Quick Tunnel tạm thời. Hostname đổi khi tạo lại tunnel; không coi đây là domain production hoặc cam kết uptime. Xem [tài liệu Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
- PM2 quản lý web, API, worker, tunnel và job nguồn mẫu. Chưa nghiệm thu tự phục hồi sau reboot host/container. Không seed lại hoặc reset database trong lúc người dùng đang thử.

Không có tin khách nào được gửi bởi ứng dụng. Pilot thật D02/D03 vẫn mở. Không tính hoạt động trên chín hồ sơ mẫu là sử dụng thực tế.
