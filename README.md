# Đề tài 14 — Hệ thống quản lý dự án

Ứng dụng quản lý dự án, thành viên và công việc; toàn bộ dữ liệu được lưu trong PostgreSQL. Docker Compose triển khai ứng dụng cùng pgAdmin, Nginx, Prometheus, Grafana, Loki và Promtail.

## Chức năng

- Tạo, xem, tìm kiếm, cập nhật tiến độ và xóa dự án.
- Quản lý thành viên; thành viên có thể được giao phụ trách dự án hoặc công việc.
- Tạo, xem, cập nhật trạng thái và xóa công việc; công việc liên kết với một dự án và tùy chọn một thành viên.
- Tiến độ dự án được tính lại từ tiến độ trung bình các công việc khi tạo, cập nhật hoặc xóa công việc.
- Dashboard thống kê, báo cáo ngân sách và tiến độ; dữ liệu vẫn còn sau khi khởi động lại nhờ PostgreSQL volume.
- Theo dõi ứng dụng, cơ sở dữ liệu và container bằng Prometheus/Grafana; truy vấn log ứng dụng và Nginx bằng Loki/LogQL.

## Yêu cầu

- Docker Desktop/Engine và Docker Compose v2.
- Cổng `8080` (ứng dụng, Prometheus và Grafana qua Nginx), `5050` (pgAdmin chỉ trên localhost).
- Tài khoản sinh viên/repository GitHub: tạo theo mã sinh viên `DTC245200092` trước khi nộp bài.

## Khởi chạy trên Windows

Mở PowerShell tại thư mục chứa `docker-compose.yml`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Đổi cả ba mật khẩu trong `.env` thành mật khẩu riêng, mạnh (nên dùng chuỗi ngẫu nhiên dài ít nhất 32 ký tự), sau đó chạy:

```powershell
docker compose config
docker compose up --build -d
docker compose ps
```

Lần đầu tải các image và cài dependencies có thể mất vài phút. Xem log/chẩn đoán:

```powershell
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f db
```

Để dừng mà vẫn giữ dữ liệu:

```powershell
docker compose down
```

Xóa cả dữ liệu PostgreSQL, Grafana, Loki và Prometheus (thao tác không thể hoàn tác):

```powershell
docker compose down -v
```

## Địa chỉ và tài khoản

| Thành phần | Địa chỉ | Tài khoản |
|---|---|---|
| Web quản lý | http://localhost:8080 | Không yêu cầu đăng nhập |
| Kiểm tra sức khỏe | http://localhost:8080/health | — |
| Chỉ số ứng dụng | http://localhost:8080/metrics | — |
| Prometheus | http://localhost:8080/prometheus/ | — |
| Grafana | http://localhost:8080/grafana/ | `admin` / giá trị `GRAFANA_ADMIN_PASSWORD` trong `.env` |
| pgAdmin | http://localhost:5050 | giá trị `PGADMIN_EMAIL` và `PGADMIN_PASSWORD` trong `.env` |

Grafana dùng volume bền vững: mật khẩu trong `.env` chỉ khởi tạo tài khoản ở lần tạo volume đầu tiên. Nếu dùng volume Grafana đã có từ lần chạy trước, đổi mật khẩu bằng `docker compose exec grafana grafana cli admin reset-admin-password "<mật-khẩu-mới>"`. Ứng dụng demo hiện chưa có đăng nhập; không công khai ra Internet.

pgAdmin được cấu hình sẵn server **Project Management PostgreSQL** trỏ tới database `project_management`. Ở lần đăng nhập đầu, chọn **Servers → Project Management PostgreSQL → Databases → project_management**; nếu pgAdmin yêu cầu mật khẩu database, nhập giá trị `POSTGRES_PASSWORD` trong `.env`. Trong database, mở **Schemas → public → Tables** để xem `members`, `projects` và `tasks`. Nếu server chưa xuất hiện trong một cài đặt đã có pgAdmin data, đăng ký thủ công với **Host** `db`, **Port** `5432`, **Maintenance database** `project_management`, **Username** `project_app` và mật khẩu `POSTGRES_PASSWORD` trong `.env`. PostgreSQL không publish cổng ra máy host; pgAdmin là công cụ duy nhất được cung cấp cổng host và cổng này chỉ bind vào `127.0.0.1`.

Trong Query Tool của database `project_management`, có thể chạy các truy vấn theo đúng đề tài:

```sql
SELECT * FROM projects ORDER BY id;
SELECT * FROM members ORDER BY id;
SELECT * FROM tasks ORDER BY id;

SELECT p.name AS project, t.title AS task, m.name AS assignee, t.status, t.progress
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
LEFT JOIN members m ON m.id = t.assignee_id
ORDER BY p.id, t.id;
```

Không dùng `SELECT * FROM department;`: bảng `department` không thuộc schema của hệ thống quản lý dự án.

## Quan hệ và API

`members` có thể phụ trách nhiều `projects` và được giao nhiều `tasks`. Mỗi `task` thuộc một `project`; xóa dự án sẽ xóa các công việc trực thuộc. Xóa thành viên không xóa lịch sử dự án/công việc mà chuyển phân công thành chưa có.

| Phương thức | Endpoint | Tác dụng |
|---|---|---|
| GET, POST | `/api/projects` | Liệt kê/tạo dự án |
| PATCH, DELETE | `/api/projects/:id` | Cập nhật tiến độ/xóa dự án |
| GET, POST | `/api/members` | Liệt kê/tạo thành viên |
| DELETE | `/api/members/:id` | Xóa thành viên |
| GET, POST | `/api/tasks` | Liệt kê/tạo công việc |
| PATCH, DELETE | `/api/tasks/:id` | Cập nhật trạng thái/xóa công việc |

## Giám sát và truy vấn log

Grafana đã được cấu hình sẵn hai nguồn dữ liệu **Prometheus** và **Loki**. Trong **Explore**, chọn Prometheus và thử:

```promql
up
rate(container_cpu_usage_seconds_total[5m])
pg_up
```

Chọn Loki và chạy các truy vấn LogQL:

```logql
{job="app"}
{job="nginx"} |= "POST"
{job="app"} |= "Database"
```

Promtail đọc log ứng dụng và Nginx từ Docker named volumes dùng chung, không cần cấp quyền truy cập Docker socket cho bộ thu log.

## Cấu trúc triển khai

- `app/`: Express API, giao diện, khởi tạo schema/seed và kết nối PostgreSQL.
- `docker-compose.yml`: toàn bộ dịch vụ, volume, healthcheck và network.
- `nginx/`: reverse proxy, giới hạn tốc độ API, security headers.
- `prometheus/`, `grafana/`: cấu hình thu thập metrics và datasource provisioning.
- `loki/`, `promtail/`: lưu trữ và thu thập log tập trung.
- `BAO-CAO.md`: nội dung báo cáo, sơ đồ và danh sách ảnh minh chứng cần chụp khi demo.

Ứng dụng và Nginx chạy bằng user không phải root, filesystem chỉ đọc (ngoại trừ volume/log và `/tmp` cần thiết), bỏ Linux capabilities và bật `no-new-privileges`. PostgreSQL chỉ nằm trong backend network; Prometheus, Loki và exporters nằm trong network quan sát nội bộ.

## Kiểm thử nghiệm thu

1. Chạy `docker compose ps`; các dịch vụ cốt lõi phải ở trạng thái `Up`/`healthy`.
2. Mở `/health`, xác nhận cả ứng dụng và database ở trạng thái `ok`.
3. Tạo thành viên, chọn thành viên đó làm người phụ trách dự án; tạo công việc gắn với dự án và thành viên.
4. Đổi trạng thái công việc thành **Hoàn thành**, rồi xác nhận tiến độ tổng hợp của dự án thay đổi; xóa công việc và kiểm tra lại.
5. Khởi động lại Compose và xác nhận dự án/thành viên/công việc vẫn còn.
6. Kiểm tra Prometheus targets; trong Grafana Explore chạy tối thiểu hai truy vấn LogQL ở trên.
7. Kiểm tra response có security headers, xác nhận pgAdmin chỉ nghe trên localhost và database không publish cổng.

## Báo cáo và nộp bài

Hoàn thiện nội dung [BAO-CAO.md](./BAO-CAO.md): điền thông tin giảng viên/lớp, chụp và thay các vị trí ảnh minh chứng, sau đó in/xuất PDF để bảo đảm định dạng báo cáo ít nhất 10 trang. Tạo GitHub repository theo mã sinh viên, đưa mã nguồn và hướng dẫn chạy này lên GitHub; tạo các commit mô tả rõ tiến độ triển khai.
