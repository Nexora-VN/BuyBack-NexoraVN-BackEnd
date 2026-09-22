# Hướng dẫn Vận hành: Logging, Truy vết lỗi, Migration & Checklist Kiểm thử

Tài liệu này hướng dẫn đội ngũ vận hành và phát triển tra vết lỗi, giám sát hệ thống qua Docker log, xử lý an toàn database migration và kiểm thử nghiệm thu trước go-live.

---

## 1. Cấu hình Xoay Log Docker (Log Rotation Reference)

> [!NOTE]
> Cấu hình dưới đây được cung cấp để tham khảo và sẵn sàng áp dụng khi cần; **chưa tự động áp dụng lên VPS** để đảm bảo an toàn cho môi trường đang chạy.

### Lựa chọn 1: Cấu hình trực tiếp trong `docker-compose.yml`

Bổ sung khối `logging` cho từng service:

```yaml
services:
  backend:
    # ... các cấu hình hiện có ...
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

  frontend:
    # ... các cấu hình hiện có ...
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"
```

### Lựa chọn 2: Cấu hình mặc định toàn Docker Daemon trên máy chủ

Chỉnh sửa hoặc tạo file `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
```

Sau đó tải lại daemon:
```bash
sudo systemctl reload docker
```

---

## 2. Tra vết và Lọc Docker Log theo `requestId` & `jobId`

Toàn bộ Backend, Next.js proxy và telemetry đều xuất log dưới định dạng **JSON có cấu trúc** ra stdout/stderr của Docker container. Mọi request đều có `requestId` (UUID) truyền xuyên suốt FE -> Next.js -> BE và trả về header `X-Request-Id`. Mọi job nền có `jobId`/`batchId`.

### Cấu trúc Log JSON Chuẩn

```json
{
  "level": 30,
  "time": 1774330000000,
  "event": "http.completed",
  "context": "HTTP",
  "requestId": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "stage": "generate_short_link",
  "durationMs": 145,
  "outcome": "success",
  "errorCode": null
}
```

- `level`: 20 (`debug`), 30 (`info`), 40 (`warn`), 50 (`error`).
- `event`: Tên sự kiện (`http.started`, `http.completed`, `generate.completed`, `job.started`, `job.failed`, `browser.failed`, ...).
- `requestId`: ID của HTTP request cần tra cứu.
- `jobId` / `batchId`: ID của background job (reconciliation, settlement).

### Lệnh lọc log trên máy chủ VPS

1. **Xem log theo thời gian thực của backend**:
   ```bash
   docker compose logs -f backend
   ```

2. **Lọc toàn bộ dấu vết của một `requestId` (khi người dùng báo lỗi có mã tra lỗi)**:
   ```bash
   # Lọc đơn giản bằng grep
   docker compose logs backend | grep -F "d290f1ee-6c54-4b01-90e6-d701748f0851"

   # Lọc và format bằng jq để đọc dễ dàng
   docker compose logs backend | grep "d290f1ee-6c54-4b01-90e6-d701748f0851" | jq .
   ```

3. **Lọc log lỗi HTTP 4xx / 5xx**:
   ```bash
   docker compose logs backend | jq 'select(.level >= 40)'
   ```

4. **Lọc log theo background job (`jobId` hoặc `batchId`)**:
   ```bash
   docker compose logs backend | jq 'select(.batchId == "BATCH_UUID" or .jobId == "BATCH_UUID")'
   ```

5. **Lọc log lỗi runtime từ browser gửi về (Next.js telemetry)**:
   ```bash
   docker compose logs frontend | grep '"event":"browser.failed"' | jq .
   ```

---

## 3. Quy trình Tra Vết Lỗi Chuỗi 7 Bước Tạo Link Affiliate

Khi gọi API `POST /api/v1/generate-affiliate`, hệ thống xử lý tuần tự qua 7 bước:

```
validate_input → fetch_product → validate_product → upsert_product → generate_short_link → fallback_link → save_history
```

### Bảng Tra Cứu Sự Cố và Mã Lỗi Từng Bước

| Bước (`stage`) | Mã lỗi (`errorCode`) | HTTP Status | Nguyên nhân | Hướng xử lý |
| :--- | :--- | :--- | :--- | :--- |
| `validate_input` | `SHOPEE_LINK_INVALID` | 400 | URL không đúng định dạng HTTPS hoặc không thuộc domain Shopee (`shopee.vn`, `s.shopee.vn`, ...) | Kiểm tra URL người dùng nhập vào. |
| `fetch_product` | `AFFILIATE_PROVIDER_TIMEOUT` | 504 | AddLiveTag Product Data API không phản hồi sau 10s | Kiểm tra mạng VPS tới `data.addlivetag.com`. |
| `fetch_product` | `AFFILIATE_PROVIDER_ERROR` | 502 | Provider trả lỗi HTTP hoặc không kết nối được | Kiểm tra tình trạng dịch vụ bên thứ ba. |
| `fetch_product` | `PRODUCT_PROVIDER_INVALID_RESPONSE` | 502 | Provider trả JSON không đúng contract | Kiểm tra cấu trúc payload phản hồi từ provider. |
| `validate_product`| `PROVIDER_PRODUCT_INVALID` | 502 | `originLink` provider trả về không khớp `shopId` hoặc `itemId` | Dữ liệu sản phẩm từ provider bị sai lệch nguồn. |
| `upsert_product` | `DATABASE_SCHEMA_MISMATCH` | 500 | Thiếu unique key `product_shop_id_item_id_key` trên bảng `aff.product` | Kiểm tra và chạy `pnpm prisma:migrate:deploy`. |
| `upsert_product` | `DATABASE_UNAVAILABLE` | 503 | Database PostgreSQL tạm thời không kết nối được | Kiểm tra kết nối DB. |
| `generate_short_link` | `PROVIDER_NOT_CONFIGURED` / `PROVIDER_TIMEOUT` | *(Tự động fallback)* | Không có `ADDLIVETAG_API_KEY` hoặc short-link API bị timeout | Hệ thống tự chuyển sang link dự phòng `an_redir`. **Không phải lỗi toàn request**. |
| `save_history` | `INTERNAL_SERVER_ERROR` | 500 | Lỗi lưu bản ghi `affiliate_link` vào DB sau khi sản phẩm đã lưu | Log ghi rõ `productSaved: true`. Cần tra cứu `requestId` để kiểm tra DB. |

> [!IMPORTANT]
> **Không retry tự động**: Hệ thống không tự ý retry các bước ghi lịch sử hay thao tác tạo link để tránh sinh trùng lặp dữ liệu và sai lệch tracking affiliate.

---

## 4. Quản lý Migration & Cảnh Báo An Toàn Bảng LMS

> [!CAUTION]
> **NGHIÊM CẤM CHẠY `prisma migrate dev` HOẶC `prisma migrate reset` TRÊN DATABASE PRODUCTION/APP!**
> Cơ sở dữ liệu đang có các bảng LMS thuộc phân hệ khác và tồn tại schema drift. Nếu chạy `migrate dev`, Prisma sẽ phát hiện drift và cảnh báo/yêu cầu reset toàn bộ DB, gây mất mát dữ liệu nghiêm trọng.

### Quy tắc xử lý Migration:

1. **Phát triển / Tạo migration mới (Chỉ chạy trên local)**:
   - Sử dụng database local dùng một lần (ví dụ: `nexora_generate_test` hoặc `nexora_readiness_test`).
   - Tạo migration bằng lệnh:
     ```bash
     pnpm prisma:migrate
     ```
     Script `scripts/migration-local.mjs` sẽ chặn nếu `DATABASE_URL` không trỏ tới `localhost` hoặc `127.0.0.1`.
2. **Kiểm tra trạng thái migration trước phát hành**:
   ```bash
   pnpm migration:check
   ```
3. **Áp dụng migration trên máy chủ (Staging / Production)**:
   - **CHỈ DÙNG** lệnh:
     ```bash
     pnpm prisma:migrate:deploy
     ```
   - Lệnh này chỉ chạy các file SQL migration chưa được áp dụng, tuyệt đối không tạo bảng mới từ schema hay reset database.

### Xử lý khi Readiness Check báo lỗi 503

Endpoint `GET /api/v1/health/ready` kiểm tra bắt buộc tính sẵn sàng của database và sự tồn tại của index:
- Tên index: `product_shop_id_item_id_key`
- Bảng: `aff.product`
- Điều kiện: `indisunique AND indisvalid`

Nếu `/health/ready` trả về `503 Service Unavailable`:
1. Kiểm tra log backend: tìm sự kiện `DATABASE_SCHEMA_MISMATCH`.
2. Chạy `pnpm prisma:migrate:deploy` để áp dụng migration `20260922090000_product_external_ids_unique`.
3. Kiểm tra lại: `curl -i http://localhost:8080/api/v1/health/ready`. Phải trả về `{"status":"ok"}` với HTTP 200.

---

## 5. Checklist Kiểm Thử Thủ Công Trên Giao Diện Web (Pre-Go-Live)

Sau khi hoàn tất cài đặt, hãy sử dụng checklist này để kiểm tra toàn bộ luồng nghiệp vụ trên trình duyệt:

### A. Xác thực và Phiên Đăng Nhập
- [ ] **Đăng nhập**: Đăng nhập bằng tài khoản hợp lệ. Token được lưu trong HTTP-only cookie (`bb_access`, `bb_refresh`).
- [ ] **Token Refresh**: Để phiên hết hạn access token (hoặc giả lập hết hạn). Khi gọi API, client tự động refresh token trong nền (chỉ gửi đúng 1 request refresh) và retry thành công.
- [ ] **Đăng xuất**: Bấm đăng xuất, các cookie phiên được dọn sạch, chuyển hướng về trang login.

### B. Luồng Tạo Link Cashback (Affiliate)
- [ ] **Tạo link thành công**:
  - Dán link Shopee chuẩn: `https://s.shopee.vn/5q8MjSk534`.
  - Bấm tạo link: hiển thị card thông tin sản phẩm (ảnh, tên shop, giá tiền, hoa hồng dự kiến).
  - Bấm nút **Copy link**: hiển thị thông báo đã sao chép.
  - Bấm nút **Mua ngay**: mở đúng link affiliate trên tab mới.
- [ ] **Tạo lặp lại cùng sản phẩm**:
  - Dán lại cùng link và tạo tiếp.
  - Sản phẩm giữ nguyên ID/UUID, thông tin cập nhật mới nhất, lịch sử tạo link có thêm bản ghi mới.
- [ ] **Chống double-submit**: Bấm nút tạo link liên tục; chỉ có 1 request được gửi đi, nút hiển thị trạng thái đang xử lý.
- [ ] **Hủy kết quả cũ khi URL thay đổi**: Dán link 1, khi đang tải nhanh chóng gõ sửa link khác; kết quả link cũ không hiển thị đè lên màn hình.
- [ ] **Kiểm tra URL không hợp lệ**:
  - Dán link sai domain (ví dụ: `https://example.com/product/1/2` hoặc `http://shopee.vn/...`).
  - Giao diện báo lỗi ngay lập tức mà không gọi lên backend.
- [ ] **Tra cứu lỗi với `requestId`**:
  - Tắt mạng hoặc thử trường hợp lỗi có chủ đích.
  - Thông báo lỗi hiển thị rõ ràng, kèm nút bấm `Mã tra lỗi: <UUID>`. Bấm vào nút để copy UUID.
  - Dùng UUID này kiểm tra trong log Docker: tìm thấy đúng sự kiện `request.failed`.

### C. Quản lý Sản phẩm & Người dùng (Backoffice)
- [ ] **Danh sách sản phẩm**:
  - Tải danh sách sản phẩm phân trang ổn định, sắp xếp đúng tham số sort.
  - Tìm kiếm sản phẩm: kiểm tra debounce 300ms (chỉ tìm kiếm sau khi ngừng gõ 300ms).
  - Mở dialog sửa/thêm: dialog được lazy-load mượt mà.
  - Nhập sai dữ liệu: dialog hiển thị thông báo lỗi và mã tra cứu lỗi `Mã tra lỗi: <UUID>`.
- [ ] **Danh sách người dùng**:
  - Kiểm tra xem danh sách, đổi trạng thái ACTIVE / DISABLED.
  - Sửa thông tin và lưu: hiển thị thông báo thành công.

### D. Phân hệ Tài chính (Finance)
- [ ] **Dashboard tài chính**: Tải số liệu thống kê tổng quan.
- [ ] **Danh sách Commissions**:
  - Kiểm tra cột `settlementEligibility` hiển thị trạng thái hợp lệ / không hợp lệ cùng các blockers.
  - Các query kiểm tra tính đủ điều kiện được batching theo trang, không bị N+1 query.
- [ ] **Polling có điều kiện**:
  - Ở màn hình batches: khi có batch đang chạy (`QUEUED`, `RUNNING`), hệ thống poll cập nhật mỗi 15s.
  - Chuyển tab trình duyệt sang ứng dụng khác: việc polling tự động dừng lại để tiết kiệm tài nguyên.
  - Khi không có batch chạy: không thực hiện polling định kỳ vô cớ.
- [ ] **Thao tác Settlement & Reconciliation**:
  - Thực hiện theo đúng quyền hạn tài khoản (Admin/Super Admin).
  - Tạo settlement draft, xác nhận settlement trong transaction an toàn.

---

## 6. Tổng Kết Thay Đổi & Các Điểm Cần Chú Ý Trước Khi Phát Hành

| Thành phần | Thay đổi thực hiện | Lưu ý kiểm tra |
| :--- | :--- | :--- |
| **Error Contract** | Chuẩn hóa `{ statusCode, code, message, requestId, timestamp, path, details }` | Không bao giờ chứa SQL, raw provider error hoặc credential. |
| **Pino Logger** | Cấu trúc hóa toàn bộ log ra JSON Docker | Default production: `LOG_LEVEL=info`. Bật `LOG_LEVEL=debug` khi cần tra cứu chi tiết. |
| **Process Lifecycle**| Bắt `unhandledRejection`, `uncaughtException`, thoát `process.exit(1)` khi fatal | Không để tiến trình treo hoặc chạy trong trạng thái lỗi không phục hồi. |
| **FE Architecture** | Tách gọn `generate-link-*`, `finance-*`, `product-form-dialog`, `user-form-dialog` | Giữ nguyên mọi export cũ để tránh phá vỡ import. Lazy-load dialog nặng. |
| **DB & Migration** | Migration `20260922090000_product_external_ids_unique` | Chỉ chạy `prisma migrate deploy`. Cấm tuyệt đối `migrate dev` / `reset`. |
