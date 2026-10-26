# Tình huống chăm sóc và cách xử lý

Nguyên tắc: mỗi lần liên hệ phải có lý do hữu ích cho khách. D là ngày giao thành công có bằng chứng. Không cam kết ưu đãi, bảo hành hay cách dùng chưa được doanh nghiệp duyệt. Cá nhân hóa theo thương hiệu, sản phẩm và tag có căn cứ; không thay câu chữ ngẫu nhiên để né kiểm soát của nền tảng.

| Tình huống | Hành động / nội dung phù hợp | Trạng thái V1 |
|---|---|---|
| Đơn chưa giao, chỉ vừa tạo hoặc đang vận chuyển | Chưa khởi động lịch sau mua | Chặn trong bộ lập lịch |
| Đã thanh toán nhưng thiếu thời điểm giao | Chờ sự kiện giao; không lấy ngày thanh toán thay D | Chặn trong adapter |
| Giao một phần hoặc chưa rõ trạng thái | Nhân viên kiểm tra trước; không nói khách đã nhận toàn bộ | Chặn chuỗi toàn đơn |
| D+1, nhận hàng ổn | Hỏi trải nghiệm nhận hàng, mở đường hỗ trợ; chưa vội bán tiếp | Mẫu nháp theo hai thương hiệu |
| D+5, cần giá trị sử dụng | Hỏi nhu cầu sử dụng, cung cấp hướng dẫn đã kiểm chứng | Mẫu nháp; cần duyệt chính sách sản phẩm |
| D+12, đang sử dụng | Lắng nghe trải nghiệm, nhận vấn đề nếu có | Mẫu nháp |
| D+30, có nhu cầu phù hợp | Gợi ý mua lại theo sản phẩm/tag, hỏi nhu cầu trước khi ưu đãi | Mẫu nháp |
| D+60/D+90, lâu chưa tương tác | Kết nối lại ngắn gọn, có giá trị, không thúc ép | Mẫu nháp; giới hạn im lặng vẫn áp dụng |
| Khách đã mua lại hoặc có đơn mới | Dừng việc dựa trên đơn cũ, chờ D mới có xác minh | Đã có test |
| Đơn mới bị hủy/hoàn hoặc có trả hàng | Dừng chuỗi liên quan, chuyển hỗ trợ nếu cần | Đã có test; chưa tự suy diễn lý do |
| Khách trả lời bất kỳ | Dừng chăm sóc chủ động; nhân viên xử lý hội thoại | Đã có test |
| Khách hẹn ngày cụ thể | Ghi lời hẹn và lý do, tạo việc đúng ngày; không đẩy tin giữa thời gian chờ | Đã có test |
| Khiếu nại, lỗi sản phẩm, yêu cầu hỗ trợ | Ưu tiên giải quyết; dừng bán tiếp cho tới khi ghi nhận xử lý | Có cờ hỗ trợ và kết quả xử lý |
| Khách không muốn nhận liên hệ | Ghi từ chối, dừng chủ động cho khách/thương hiệu đó | Đã có test; không dùng tag để vượt từ chối |
| Hai lần chủ động không có phản hồi | Tạm dừng chuỗi; tránh nhắc lặp gây phiền | Đã có test |
| Vừa có liên hệ gần đây | Chặn nhắc chủ động trong khoảng nghỉ 7 ngày; lời hẹn của khách được xử lý riêng | Đã có test |
| Nền tảng hạn chế API | Cho chuẩn bị/copy; nhân viên kiểm tra trong Pancake, ghi “bị chặn” nếu không gửi được | Đã có test; không có API gửi |
| Copy nhưng chưa gửi | Giữ nội dung đã chuẩn bị; số lần gửi không tăng | Đã kiểm tra qua trình duyệt |
| Không rõ đã gửi hay chưa | Đóng băng liên hệ tiếp; đối soát rõ “đã gửi/chưa gửi” | Đã có test |
| Bị gián đoạn, mất mạng hoặc ứng dụng khởi động lại | Đọc lại trạng thái lưu trong Postgres; không tự gửi lại | Có test replay/restart; chưa có offline mode |
| Hai nhân viên cùng xử lý | Chỉ người được phân công có lease hợp lệ được copy/xác nhận | Có test quyền và cạnh tranh |
| Đổi nhân viên phụ trách | Kiểm tra membership, lưu dấu thay đổi; nội dung đang chuẩn bị cần đối soát | Có API/UI và test |
| Có nhiều thương hiệu / trùng tên khách | Khớp danh tính shop, customer ID, page và conversation ID; không gộp bằng tên | Có test tách thương hiệu |
| Tag sở thích hoặc nhóm khách thay đổi | Chọn mẫu liên quan và kiểm tra lại tag lúc xác nhận | Có test; tag do quản lý xác lập |
| Nhóm khách có chính sách giá riêng | Chỉ dùng nội dung đã duyệt cho nhóm đúng; không tự tính/đề xuất mức giảm | Cơ chế tag đã có; chính sách thật chưa đưa vào |
| Template đổi sau khi copy | Thu hồi hiệu lực bản cũ, yêu cầu chuẩn bị lại khi cần | Có test phiên bản/thu hồi |
| Template hết hạn hoặc thiếu thông tin cá nhân hóa | Chặn dùng; quản lý bổ sung/duyệt | Có test |
| Thiếu liên kết hội thoại hoặc dữ liệu quá cũ | Hiển thị lý do chặn, chờ xác minh/đồng bộ | Có test |
| Đơn cũ không đổi nhưng khách vừa nhắn | Đọc lại khách pilot theo customer ID; dùng thời gian tin nhắn thật | Adapter và test giả lập đã có; chưa chứng nhận nguồn thật |
| API lỗi, giới hạn tần suất hoặc phân trang thiếu | Dừng lượt, giữ watermark, backoff; không đoán đã đồng bộ xong | Có test 429/phân trang |
| Bỏ lỡ nhiều mốc D+x | Bỏ mốc hết hạn; không tạo một loạt tin bù | Có test |
| Cần chứng minh chăm sóc làm tăng mua lại | Theo dõi nhóm đủ 30/60/90 ngày và đối soát POS; cần pilot/đối chứng trước kết luận nhân quả | Báo cáo mô tả đã có; chưa có bằng chứng tác động |
| Khách trước mua, sinh nhật, giới thiệu bạn, bán chéo, B2B hoặc SaaS | Cần quy tắc và căn cứ riêng, không tự đưa vào chuỗi sau mua hiện tại | Mở rộng tương lai |

Thư viện hiện có 24 mẫu nháp, không tự động duyệt. Khách thật chỉ dùng bản được người có quyền duyệt. Chức năng tự gửi template trong tương lai cần một giai đoạn riêng với điều kiện nền tảng, chính sách và bằng chứng vận hành; chưa thuộc V1 đang chạy.
