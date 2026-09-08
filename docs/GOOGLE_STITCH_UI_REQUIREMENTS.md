# BuyBack NexoraVN — UI/UX Design Requirements for Google Stitch

## 1. Mục đích tài liệu

Tài liệu này là nguồn yêu cầu thống nhất để tạo giao diện web BuyBack bằng Google Stitch. Thiết kế phải phục vụ được sản phẩm hiện tại nhưng không khóa kiến trúc UI khi bổ sung các module tài chính và đối soát trong tương lai.

Không thiết kế BuyBack như một sàn thương mại điện tử. BuyBack là nền tảng trung gian cashback affiliate:

1. User dán link sản phẩm Shopee.
2. Hệ thống mở rộng và làm sạch URL, lấy thông tin sản phẩm, tạo link affiliate bằng Shopee `an_redir` với một Affiliate ID dùng chung toàn platform.
3. User dùng link đã tạo để mua hàng.
4. Saffi chỉ dùng để lấy dữ liệu đối soát, không tham gia luồng tạo link.
5. Hệ thống đồng bộ đơn hàng và commission từ provider.
6. Commission được chia 85% cashback cho user và 15% doanh thu platform.
7. Cashback chỉ được đưa vào số dư khả dụng khi provider xác nhận commission đã `PAID`.
8. User gửi yêu cầu rút tiền; admin chuyển khoản thủ công và cập nhật trạng thái thủ công.

Thiết kế không được truyền đạt rằng cashback được ghi nhận ngay khi tạo link hoặc ngay khi đặt hàng.

---

## 2. Nguyên tắc sản phẩm cốt lõi

- Một Affiliate ID duy nhất cho toàn hệ thống; không hiển thị Affiliate ID như dữ liệu user có thể chỉnh sửa.
- Attribution theo `sub_id`, trong đó hệ thống liên kết user, affiliate link, channel và tracking ID.
- Không có module click tracking nội bộ trong V1; UI không hiển thị số click giả.
- Link được tạo trực tiếp bằng Shopee `an_redir`; Saffi chỉ là nguồn đối soát.
- Thông tin sản phẩm có thể đến từ API bên thứ ba và có thể chậm hoặc sai lệch; UI cần hiển thị thời điểm cập nhật gần nhất.
- Tiền là số nguyên VND, không hiển thị phần thập phân.
- Tỷ lệ cashback mặc định: user 85%, platform 15%.
- Wallet ledger là nguồn sự thật. Số dư hiển thị là projection từ giao dịch ví.
- `VALIDATED` chưa đồng nghĩa với có thể rút. Chỉ cashback `AVAILABLE` mới cộng vào số dư khả dụng.
- Mọi thao tác tài chính quan trọng của admin phải có lý do, xác nhận và audit trail.
- Không cho admin chỉnh trực tiếp số dư hoặc commission mà không tạo adjustment record.

---

## 3. Phạm vi module

### 3.1 Module đã có trong backend

| Module            | Khả năng hiện tại                                                 | UI tương ứng                                                |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Auth              | Login, refresh token, lấy identity, logout                        | Login, session handling, account menu                       |
| Users             | CRUD user, phân trang, tìm kiếm; chỉ Admin/Super Admin            | Quản lý người dùng                                          |
| User Bank         | Đã có schema trạng thái ngân hàng, chưa có API hoàn chỉnh         | Thiết kế sẵn trang tài khoản ngân hàng, đánh dấu future     |
| Product           | CRUD product, tìm kiếm, phân trang; chỉ Admin/Super Admin         | Danh sách và chi tiết sản phẩm                              |
| Product Provider  | Lấy và normalize thông tin sản phẩm bên thứ ba                    | Product preview khi tạo link, nguồn dữ liệu và lần cập nhật |
| Affiliate         | Generate link cho User/Admin/Super Admin; quản trị affiliate link | Tạo link, kết quả link, lịch sử link, admin link management |
| Health/Backoffice | Kiểm tra API và database                                          | Provider/system status nhỏ trong admin                      |

### 3.2 Module sẽ có

| Module         | Mục tiêu                                                   | Nhóm người dùng                    |
| -------------- | ---------------------------------------------------------- | ---------------------------------- |
| Orders         | Đơn hàng/conversion được normalize từ provider             | User và Admin                      |
| Commissions    | Hoa hồng provider trả cho platform                         | User read-only, Admin vận hành     |
| Cashback       | Phần 85% phân bổ cho user                                  | User và Admin                      |
| Wallet         | Số dư projection và ledger giao dịch                       | User và Admin                      |
| Withdrawals    | Yêu cầu rút tiền, reserve balance, admin chuyển tay        | User, Finance/Admin                |
| Reconciliation | Đồng bộ Saffi, batch đối soát, mismatch, manual resolution | Admin/Finance                      |
| Provider Sync  | Raw payload, lịch sử đồng bộ và lỗi provider               | Admin kỹ thuật/vận hành            |
| Audit          | Lịch sử thao tác nhạy cảm                                  | Super Admin/Admin được cấp quyền   |
| Dashboard      | KPI tổng hợp, cảnh báo vận hành                            | User dashboard và Admin backoffice |
| Notifications  | Thông báo thay đổi trạng thái đơn, cashback, rút tiền      | Future                             |

### 3.3 Phân kỳ UI

- Phase 1 — dùng được với API hiện tại: Login, App Shell, Tạo link, Kết quả link, Admin Users, Admin Products, Admin Affiliate Links.
- Phase 2 — money flow: User Dashboard, Orders, Cashback, Wallet, Bank Account, Withdrawals.
- Phase 3 — operations: Admin Dashboard, Orders, Commission, Cashback, Wallet, Withdrawals.
- Phase 4 — reconciliation: Provider Sync, import report, batch detail, mismatch resolution, adjustment và audit.

Các màn hình Phase 2–4 vẫn được thiết kế ngay để đồng bộ hệ thống, nhưng trong bản frontend đầu tiên phải đặt sau feature flag hoặc trạng thái “Sắp ra mắt” nếu API chưa tồn tại.

---

## 4. Vai trò và quyền truy cập

### USER

- Tạo affiliate link cho chính mình.
- Xem lịch sử link của chính mình.
- Xem product preview liên quan đến link.
- Tương lai: xem đơn hàng, commission tham chiếu, cashback, wallet, ngân hàng và yêu cầu rút tiền của chính mình.
- Không xem doanh thu platform 15%.
- Không thấy raw provider payload, internal notes hoặc dữ liệu user khác.

### ADMIN

- CRUD user và product.
- Xem/quản lý affiliate link.
- Tương lai: vận hành order, commission, cashback, withdrawal và reconciliation.
- Mọi thao tác điều chỉnh tiền phải nhập lý do và được audit.
- Không mặc định có quyền sửa cấu hình bảo mật cấp hệ thống.

### SUPER_ADMIN

- Có toàn bộ quyền Admin.
- Quản lý role/status user, audit log, system/provider configuration và quyền vận hành nhạy cảm.
- Các hành động phá hủy hoặc ảnh hưởng tài chính phải dùng confirmation dialog rõ đối tượng và hậu quả.

### Role tương lai

Information architecture nên mở rộng được cho `FINANCE`, `SUPPORT`, `RECONCILIATION_STAFF` mà không cần thay toàn bộ sidebar.

---

## 5. Luồng nghiệp vụ chính

### 5.1 Tạo affiliate link

```text
User đăng nhập
  → Dán short link hoặc long link Shopee
  → Validate domain và chống URL không hợp lệ
  → Resolve redirect và làm sạch thành product URL
  → Tách shopId/itemId
  → Tìm product trong DB
      → Có: dùng dữ liệu đã lưu
      → Chưa có: gọi provider product API, normalize và lưu product
  → Tạo sub_id gắn user/link/channel/tracking
  → Generate Shopee an_redir URL
  → Lưu AffiliateLink
  → Hiển thị product preview + link kết quả + nút Copy/Share
```

UI tạo link phải có các trạng thái:

- Chưa nhập link.
- Đang kiểm tra link.
- Đang lấy thông tin sản phẩm.
- Đang tạo affiliate link.
- Thành công.
- Link không hợp lệ hoặc không thuộc Shopee.
- Redirect bất thường hoặc bị chặn vì an toàn.
- Không lấy được thông tin sản phẩm.
- Provider timeout/tạm gián đoạn.
- Tạo link thất bại và có mã lỗi.

Không hiển thị các bước kỹ thuật như SSRF hay `an_redir` cho user phổ thông. Chuyển thành thông báo dễ hiểu.

### 5.2 Từ đơn hàng đến số dư khả dụng

```text
Affiliate Link
  → User mua hàng trên Shopee
  → Saffi trả dữ liệu đối soát
  → Order/Conversion PENDING
  → Commission ESTIMATED
  → Provider validate
  → Commission VALIDATED
  → Provider thanh toán
  → Commission PAID
  → Chia 85% cashback / 15% platform
  → Cashback AVAILABLE
  → Ghi credit vào Wallet Ledger
```

UI phải tách rõ ba lớp số tiền:

- Ước tính: có thể thay đổi, chưa được rút.
- Đã xác nhận: đã đối soát nhưng chưa chắc đã được provider thanh toán.
- Khả dụng: có thể yêu cầu rút.

### 5.3 Hủy/hoàn tiền/clawback

```text
Provider đổi trạng thái order hoặc commission
  → Reconciliation cập nhật trạng thái chuẩn
  → Cashback REJECTED hoặc REVERSED
  → Wallet ghi transaction đảo chiều nếu trước đó đã cộng
  → Không xóa lịch sử cũ
```

UI dùng timeline và ledger entry để giải thích thay đổi, không sửa biến mất số tiền cũ.

### 5.4 Rút tiền thủ công

```text
User chọn tài khoản ngân hàng đã duyệt
  → Nhập số tiền ≤ available balance
  → Xác nhận yêu cầu
  → Hệ thống reserve balance
  → Withdrawal PENDING
  → Admin chuyển khoản ngoài hệ thống
  → Admin cập nhật PROCESSING/COMPLETED hoặc REJECTED/FAILED
  → Ledger release hoặc debit tương ứng
```

Không hiển thị “chuyển khoản tự động”. UI phải nói rõ yêu cầu được xử lý thủ công và có thể cần thời gian.

### 5.5 Đối soát

```text
Saffi API
  → Auto sync
  → Reconciliation batch
  → Match internal với provider
  → MATCHED hoặc MISMATCH/MISSING/MANUAL_REVIEW
  → Admin resolve
  → Adjustment nếu cần
  → Audit log
```

Fallback tương lai:

```text
Provider API lỗi
  → Admin tải report từ Shopee
  → Upload CSV/XLSX
  → Validate file
  → Preview kết quả
  → Run reconciliation
  → Resolve mismatch
```

---

## 6. Information architecture

Nên dùng hai app shell khác nhau nhưng chung design system.

### 6.1 User app — mobile-first

Desktop navigation:

```text
Tổng quan
Tạo link
Link của tôi
Đơn hàng
Cashback
Ví của tôi
Rút tiền
Tài khoản
```

Mobile bottom navigation tối đa 5 mục:

```text
Tổng quan | Tạo link | Đơn hàng | Ví | Tài khoản
```

Các trang Cashback, Link history và Withdrawal được truy cập từ Dashboard/Ví/Tài khoản hoặc menu “Thêm”.

Frontend route gợi ý:

```text
/login
/app
/app/links/new
/app/links
/app/links/:id
/app/orders
/app/orders/:id
/app/cashback
/app/wallet
/app/withdrawals
/app/withdrawals/new
/app/profile
/app/bank-accounts
```

### 6.2 Admin backoffice — desktop-first

Sidebar nhóm theo nghiệp vụ:

```text
TỔNG QUAN
  Dashboard

ĐỐI TƯỢNG
  Người dùng
  Sản phẩm
  Affiliate links

TÀI CHÍNH
  Đơn hàng
  Commission
  Cashback
  Ví & ledger
  Yêu cầu rút tiền

ĐỐI SOÁT
  Reconciliation batches
  Provider sync
  Manual adjustments

HỆ THỐNG
  Audit logs
  Provider health
  Cấu hình
```

Frontend route gợi ý:

```text
/admin
/admin/users
/admin/users/:id
/admin/products
/admin/products/:id
/admin/affiliate-links
/admin/affiliate-links/:id
/admin/orders
/admin/orders/:id
/admin/commissions
/admin/cashbacks
/admin/wallets
/admin/withdrawals
/admin/withdrawals/:id
/admin/reconciliation
/admin/reconciliation/import
/admin/reconciliation/:batchId
/admin/provider-sync
/admin/audit-logs
/admin/system-health
```

Admin mobile chỉ cần hỗ trợ xem nhanh và xử lý thao tác đơn giản. Bảng đối soát phức tạp ưu tiên desktop/tablet landscape.

---

## 7. Yêu cầu màn hình User

### 7.1 Login

- Logo BuyBack/NexoraVN, câu mô tả ngắn: “Mua sắm thông minh, nhận lại giá trị”.
- Form email, mật khẩu, hiện/ẩn mật khẩu, ghi nhớ phiên đăng nhập.
- CTA chính “Đăng nhập”.
- Loading trong button, lỗi sai thông tin, tài khoản bị khóa và lỗi hệ thống.
- Không hiển thị form register ở Phase 1 vì backend chưa có register công khai.
- Desktop dùng split layout nhẹ: brand illustration trừu tượng ở trái, form ở phải. Mobile chỉ giữ form và brand compact.

### 7.2 User Dashboard

- Greeting theo display name.
- CTA nổi bật “Tạo link cashback”.
- Ba balance cards: “Ước tính”, “Đã xác nhận”, “Có thể rút”. Chỉ “Có thể rút” dùng CTA rút tiền.
- Recent links với ảnh sản phẩm, tên, thời gian và trạng thái.
- Recent orders/cashback timeline.
- Banner giải thích ngắn: cashback chỉ khả dụng sau khi Shopee/provider xác nhận thanh toán.
- Empty state hướng user đến tạo link đầu tiên.

### 7.3 Tạo link cashback — màn hình quan trọng nhất

Khối 1 — Input:

- Heading “Dán link Shopee để tạo link cashback”.
- Textarea hoặc URL input lớn, hỗ trợ short link và long link.
- Paste button trên mobile.
- CTA “Kiểm tra sản phẩm”.
- Helper text về domain hỗ trợ.

Khối 2 — Progress:

- Stepper nhẹ: `Kiểm tra link → Lấy sản phẩm → Tạo link`.
- Skeleton product card khi đang fetch.
- Không dùng spinner toàn trang nếu chỉ một khối đang tải.

Khối 3 — Product preview:

- Ảnh sản phẩm, tên, shop, giá hiện tại, rating, số lượng bán.
- Badge “Xtra” nếu `isExtra`.
- Hiển thị “Tỷ lệ commission tham khảo” và “Cashback ước tính” với disclaimer rõ đây không phải cam kết cuối cùng.
- Hiển thị “Cập nhật lúc …” và data source ở tooltip/admin detail, không làm rối user.

Khối 4 — Result:

- Generated affiliate URL trong read-only input.
- CTA chính “Sao chép link”.
- CTA phụ “Mở Shopee”, “Chia sẻ”.
- Success toast sau khi copy.
- Link history shortcut.

### 7.4 Link của tôi

- Search theo URL/tên sản phẩm; filter trạng thái và khoảng ngày.
- Desktop table; mobile card list.
- Mỗi item: ảnh, product name, origin domain, generated link rút gọn, channel, trạng thái, created time.
- Actions: copy, open, xem chi tiết.
- Không hiển thị raw `sub_id` trên list user. Có thể hiển thị tracking reference thân thiện trong detail.
- Trạng thái hiện tại: `WORKING`, `EXPIRED`, `DELETED`.

### 7.5 Chi tiết affiliate link

- Product summary.
- Origin link, clean link và generated link với copy action.
- Trạng thái, ngày tạo, channel.
- Tương lai: các order được attribution từ link này.
- Timeline không được có click count nếu hệ thống không log click.

### 7.6 Đơn hàng

- Summary cards: pending, validated, rejected, manual review.
- Filter theo trạng thái, provider, khoảng thời gian và mã đơn.
- Table/card fields: mã đơn, sản phẩm, giá trị đơn, commission ước tính, cashback dự kiến, trạng thái, ngày mua.
- Detail dùng timeline trạng thái provider/internal/reconciliation.
- Hiển thị cancel/refund reason khi có.

### 7.7 Cashback

- Tabs: Tất cả, Đang chờ, Đã xác nhận, Khả dụng, Bị từ chối/đảo chiều.
- Mỗi record liên kết về order và commission.
- Hiển thị công thức dễ hiểu: commission × 85% = cashback user.
- Platform share 15% không hiển thị ở user UI.
- Status timeline và tooltip giải thích vì sao chưa rút được.

### 7.8 Ví của tôi

- Hero balance card “Số dư có thể rút”.
- Secondary values: reserved balance và pending cashback.
- CTA “Rút tiền”.
- Ledger list append-only: cashback credit, withdrawal reserve/debit/release, reversal, manual adjustment.
- Mỗi transaction có dấu `+/-`, loại, reference, trạng thái và thời gian.
- Không dùng màu xanh/đỏ làm tín hiệu duy nhất; luôn có icon và label.

### 7.9 Tài khoản ngân hàng

- Danh sách account cards, che số tài khoản ngoại trừ 4 số cuối.
- Trạng thái `PENDING`, `APPROVED`, `REJECT`.
- Form thêm/sửa: ngân hàng, số tài khoản, chủ tài khoản, chi nhánh nếu cần.
- Warning rằng tên chủ tài khoản phải khớp thông tin xác minh.
- Dữ liệu nhạy cảm không xuất hiện trong URL hoặc toast.

### 7.10 Rút tiền

- Hiển thị số dư khả dụng và minimum/maximum nếu được cấu hình sau này.
- Chọn bank account đã approved.
- Input tiền có format VND theo lúc gõ.
- Summary trước khi xác nhận: số tiền, tài khoản nhận đã mask, thời gian xử lý dự kiến.
- History với status `PENDING`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`.
- Detail có timeline và lý do reject/fail.

### 7.11 Tài khoản cá nhân

- Profile information, email, phone, display name/full name.
- Session/logout.
- Role chỉ hiển thị dạng read-only.
- Future: security/session management và notification preferences.

---

## 8. Yêu cầu màn hình Admin

### 8.1 Admin Dashboard

- KPI: tổng user active, link tạo hôm nay, order pending, commission estimated/paid, cashback available, withdrawal pending.
- Provider/system health strip.
- Chart commission/cashback theo thời gian, không dùng chart trang trí nếu chưa có data.
- Work queues: reconciliation mismatch, withdrawal pending, manual review.
- Recent admin activity.
- Mỗi KPI có timestamp “Cập nhật lúc”.

### 8.2 Quản lý người dùng

- Table: display name, email, phone, role, status, created date.
- Search, role filter, status filter, pagination.
- Actions: view, edit, disable/enable, soft delete theo quyền.
- Create/edit drawer hoặc page form.
- Detail tabs: Tổng quan, Ngân hàng, Affiliate links, Orders, Cashback, Wallet, Withdrawals, Audit.
- Không hiển thị password/password hash.
- SUPER_ADMIN actions phải có confirmation và reason nếu ảnh hưởng quyền hoặc khóa tài khoản.

### 8.3 Quản lý sản phẩm

- Table/card hybrid có ảnh thumbnail, itemId/shopId, tên, shop, giá, sales, rating, tổng rate, commission, last update.
- Search theo product/shop/URL; filter itemId/shopId.
- Product detail gồm price stats và latest price snapshot.
- Badge dữ liệu cũ nếu quá thời gian refresh policy.
- Create/edit form phục vụ admin/debug, nhưng dữ liệu provider nên ưu tiên read-only và có action refresh riêng trong tương lai.
- Xóa bị chặn nếu product đang có affiliate link; dialog phải giải thích quan hệ này.

### 8.4 Quản lý affiliate links

- Table: link ID/reference, user, product, origin/clean/generated link, convert origin, channel, status, created date.
- Copy/open actions không chiếm nhiều không gian.
- Filters: user, status, source, channel, date.
- Detail hiển thị đủ sub IDs cho admin, nhưng trình bày dưới dạng key/value kỹ thuật trong collapsible section.
- Có error/fail code khi conversion thất bại.

### 8.5 Orders operations

- Dense data table có column chooser và sticky header.
- Filters: provider status, internal status, reconciliation status, provider, user, order ID, date range.
- Detail chia section: order summary, items, attribution, provider state, normalized state, commission/cashback, raw sync references.
- Không cho sửa trực tiếp provider order ID hoặc financial amount.

### 8.6 Commission và Cashback operations

- Commission table tách estimated/validated/paid/rejected/reversed.
- Cashback table tách pending/validated/available/rejected/reversed.
- Detail hiển thị phép tính 85/15, rate snapshot, source order và lịch sử adjustment.
- Adjustment action mở modal bắt buộc reason, preview old/new/effective amount và confirmation.

### 8.7 Wallet & Ledger operations

- Search theo user/reference/idempotency key.
- Hiển thị cached available/reserved cạnh ledger-derived balance và cảnh báo nếu mismatch.
- Không cung cấp nút “Sửa balance”. Chỉ có “Tạo adjustment” theo quyền.
- Transaction detail hiển thị reference chain.

### 8.8 Withdrawal operations

- Work queue ưu tiên `PENDING` và `PROCESSING`.
- Table: user, amount, masked bank, request time, status, assigned admin.
- Detail có wallet availability snapshot tại thời điểm request và bank snapshot.
- Actions: Mark Processing, Complete, Reject, Mark Failed.
- Complete phải yêu cầu transfer reference; Reject/Failed phải yêu cầu reason.
- Dialog cảnh báo rõ hành động nào debit/release reserved balance.

### 8.9 Reconciliation batches

- Batch list: provider, cycle/date range, source API/CSV/XLSX/manual, status, total, matched, mismatch, completed time.
- Import wizard: chọn file → validate → preview mapping/errors → confirm import → processing → result.
- Batch detail có progress summary và tabs theo result.
- Result statuses: `MATCHED`, `MISMATCHED`, `MISSING_INTERNAL`, `MISSING_EXTERNAL`, `AMOUNT_MISMATCH`, `STATUS_MISMATCH`, `DUPLICATED`, `MANUAL_REVIEW`.
- Comparison view hai cột Internal vs Provider, highlight chính xác field lệch.
- Resolution actions: Accept External, Keep Internal, Manual Adjustment, Ignore.
- Mọi resolution cần note/reason và hiển thị actor/time.

### 8.10 Provider sync và system health

- Provider status, last successful sync, last failed sync, latency và error count.
- Sync history table: endpoint, external ID, processing status, received time, error.
- Raw payload nằm trong JSON viewer collapsible, không load toàn bộ mặc định.
- Manual retry cần confirmation và idempotency warning.

### 8.11 Audit logs

- Immutable read-only table.
- Filters: actor, action, entity type, entity ID, date.
- Detail drawer hiển thị old/new diff, reason, IP/user agent nếu được phép.
- Không có edit/delete action.

---

## 9. Trạng thái và cách hiển thị

### Trạng thái hiện tại

| Nhóm           | Trạng thái                |
| -------------- | ------------------------- |
| User           | ACTIVE, DISABLED, DELETED |
| Bank           | PENDING, APPROVED, REJECT |
| Affiliate Link | WORKING, EXPIRED, DELETED |

### Trạng thái tương lai chuẩn

| Nhóm       | Trạng thái                                                       |
| ---------- | ---------------------------------------------------------------- |
| Conversion | PENDING, VALIDATED, PARTIALLY_VALIDATED, REJECTED, MANUAL_REVIEW |
| Commission | ESTIMATED, VALIDATED, PAID, REJECTED, REVERSED, MANUAL_REVIEW    |
| Cashback   | PENDING, VALIDATED, AVAILABLE, REJECTED, REVERSED                |
| Withdrawal | PENDING, PROCESSING, COMPLETED, REJECTED, FAILED                 |

### Semantic status colors

- Success/available/paid/completed: green `#16845B` trên nền `#E9F7F1`.
- Pending/estimated/processing: amber `#A96813` trên nền `#FFF5DC`.
- Info/validated: blue `#3568C9` trên nền `#EAF1FF`.
- Rejected/failed/reversed/deleted: red `#C23B55` trên nền `#FDECEF`.
- Manual review/mismatch: purple `#7752A8` trên nền `#F2ECFA`.
- Neutral/expired/disabled: gray `#6F6670` trên nền `#F2EFF1`.

Status badge luôn có text; không chỉ dùng màu.

---

## 10. Design system: hồng nhạt và trắng

### 10.1 Định hướng hình ảnh

- Cảm giác: đáng tin cậy, nhẹ nhàng, minh bạch, hiện đại, có yếu tố fintech nhưng không lạnh lẽo.
- Hồng nhạt là nhận diện chính; trắng là surface. Dùng hồng đậm vừa đủ cho CTA và focus state để đạt contrast.
- Không sao chép màu cam của Shopee hoặc đỏ của các nền tảng cashback khác.
- Tránh phong cách quá trẻ con, quá nhiều trái tim, glitter hoặc gradient neon.
- Product imagery là điểm màu tự nhiên; chrome UI phải tiết chế.

### 10.2 Color tokens

```text
Brand 700 / CTA pressed     #A72D61
Brand 600 / Primary CTA     #C83F77
Brand 500 / Accent          #E05B91
Brand 200 / Active border   #F3B7CF
Brand 100 / Soft surface    #FBE4ED
Brand 50 / Page tint        #FFF5F9

White / Main surface        #FFFFFF
Canvas                      #FFFAFC
Border                      #EEDDE5
Text primary                #2B1D24
Text secondary              #725F68
Text disabled               #A6949D

Success                     #16845B
Warning                     #A96813
Danger                      #C23B55
Info                        #3568C9
Review                      #7752A8
```

Primary button dùng nền `#C83F77` và chữ trắng. Không dùng chữ trắng trên hồng quá nhạt.

### 10.3 Typography

- Font ưu tiên: `Be Vietnam Pro`; fallback `Inter`, system sans-serif.
- Page title desktop 28–32px, mobile 24–28px.
- Section title 20–24px.
- Body 14–16px; table text không nhỏ hơn 13px.
- Numeric amount dùng tabular numerals, trọng lượng 600–700.
- Nội dung chính bằng tiếng Việt tự nhiên; giữ thuật ngữ kỹ thuật tiếng Anh khi admin cần đối chiếu provider.

### 10.4 Layout và shape

- User app max-width khoảng 1200px; reading/content column 720–960px tùy trang.
- Admin dùng 1440px desktop canvas, sidebar 240–264px.
- Spacing theo hệ 4/8px.
- Card radius 16px, input/button radius 10–12px, badge pill radius 999px.
- Border mảnh; shadow nhẹ, không dùng floating card dày đặc.
- Table row cao 48–56px, sticky header cho bảng dài.
- Mobile touch target tối thiểu 44×44px.

### 10.5 Icons và illustration

- Dùng icon outline thống nhất, nét mềm nhưng rõ.
- Icon gợi ý: link, bag/order, coins/cashback, wallet, bank, refresh/sync, shield/audit.
- Illustration chỉ dùng ở login, empty state và onboarding; tránh chiếm chỗ ở trang tác nghiệp.

---

## 11. Component inventory

Google Stitch cần tạo component có thể tái sử dụng:

- User top bar, desktop side nav, mobile bottom nav.
- Admin sidebar, header, breadcrumb và account menu.
- Primary/secondary/tertiary/danger buttons.
- URL input với paste/clear/validation state.
- Money input VND.
- Search bar, filter chips, advanced filter drawer.
- Product card/product compact row.
- Balance card và KPI card.
- Status badge theo semantic token.
- Data table: pagination, sorting, selectable rows, empty/error/loading states.
- Timeline/status stepper.
- Wallet ledger row.
- Internal vs Provider comparison panel.
- JSON viewer collapsible.
- Confirmation modal có reason field.
- Toast, inline alert, skeleton, empty state và retry state.
- File upload dropzone và import wizard stepper.

---

## 12. Data formatting và content rules

- Tiền: `134.300 ₫`, không hiển thị `134300.00`.
- Percentage: tối đa 2 chữ số cần thiết, ví dụ `10,5%`.
- Date time user: `08:20, 27/08/2026`; admin có thể hover để xem ISO/UTC.
- Mã dài: dùng monospace, truncate giữa chuỗi, có copy action.
- URL: hiển thị hostname + truncated path; full URL trong tooltip/detail.
- Empty value: dùng `—`, không dùng `null` hoặc `undefined` trên UI.
- Không dùng từ “hoa hồng của bạn” cho commission platform; gọi đúng “cashback dự kiến/đã xác nhận/khả dụng”.
- Disclaimer ngắn gần số tiền ước tính, không giấu trong footer.
- Thông báo lỗi phải nói user có thể làm gì tiếp theo: sửa link, thử lại hoặc liên hệ hỗ trợ.

---

## 13. Loading, empty, error và edge cases

Mỗi màn hình được generate phải có ít nhất bốn state:

1. Default/data state.
2. Loading/skeleton state.
3. Empty state có CTA phù hợp.
4. Error state có retry hoặc hướng xử lý.

Edge cases bắt buộc:

- Access token hết hạn: refresh im lặng; nếu thất bại quay về login và giữ return URL.
- User không đủ quyền: trang 403 thân thiện, không chỉ toast.
- Link Shopee invalid hoặc redirect ngoài allowlist.
- Provider product API timeout.
- Product không có ảnh hoặc metadata thiếu.
- Tên sản phẩm rất dài.
- Bảng không có kết quả sau filter.
- Cashback bị reversed sau khi từng available.
- Withdrawal rejected/failed với lý do dài.
- Reconciliation có số lượng record lớn và batch đang processing.

---

## 14. Responsive và accessibility

- Generate cả desktop 1440px và mobile 390px cho user flow chính.
- Admin ưu tiên desktop 1440px và tablet 1024px.
- Table user chuyển thành card list trên mobile; admin table dùng horizontal scroll có pinned key columns.
- Sidebar admin collapse thành icon rail ở tablet.
- Keyboard focus ring dùng Brand 500 với offset rõ.
- Contrast tối thiểu WCAG AA.
- Form field có label thật, helper/error text và trạng thái focus/disabled/read-only.
- Dialog trap focus; action phá hủy không được là lựa chọn mặc định.
- Chart có data table/tooltip tương đương và không chỉ phân biệt bằng màu.

---

## 15. Những điều Google Stitch không được tự thêm

- Không thêm click analytics vì hệ thống không log click nội bộ.
- Không thêm payment gateway hoặc rút tiền tự động.
- Không cho user tự chỉnh Affiliate ID.
- Không cam kết cashback ngay lập tức.
- Không gộp commission, cashback và wallet balance thành một khái niệm.
- Không tạo crypto wallet, points hoặc đa tiền tệ; V1 chỉ dùng VND.
- Không tạo social feed, gamification, leaderboard hoặc coupon marketplace.
- Không dùng dark mode làm thiết kế chính; có thể để future token.
- Không đặt toàn bộ nghiệp vụ admin vào một màn hình dashboard.
- Không cho chỉnh/xóa audit log hoặc wallet transaction.

---

## 16. Prompt nền dùng cho Google Stitch

Copy prompt sau làm project-level prompt trước khi generate từng màn hình:

```text
Design a production-ready responsive web application named “BuyBack by NexoraVN”, a Vietnamese Shopee affiliate cashback platform. This is not an ecommerce marketplace. Users paste a Shopee product URL, the system validates and normalizes it, previews the product, generates an affiliate link, then later reconciles Shopee orders through Saffi. Saffi is reconciliation-only and is not used for link generation. Cashback is 85% of paid platform commission; the platform keeps 15%. Estimated or validated cashback is not withdrawable. Only AVAILABLE cashback enters the wallet’s withdrawable balance. Withdrawals are processed manually by admins through bank transfer.

Create two related experiences using one design system:
1) A mobile-first user application.
2) A desktop-first admin operations backoffice.

Brand style: soft pink and white, trustworthy modern fintech, calm and transparent, not childish and not visually similar to Shopee. Use Be Vietnam Pro. Primary CTA #C83F77, pressed #A72D61, accent #E05B91, soft pink #FBE4ED, page tint #FFF5F9, white surfaces, border #EEDDE5, primary text #2B1D24, secondary text #725F68. Use green/amber/blue/red/purple only for semantic statuses. Rounded 16px cards, 10–12px controls, light borders and subtle shadows. Avoid excessive gradients and decorative illustrations.

Use Vietnamese UI copy. Format money as integer VND, for example “134.300 ₫”. Clearly distinguish “Ước tính”, “Đã xác nhận”, and “Có thể rút”. Always show status as text plus color/icon. Include realistic loading skeletons, empty states, error states, permission states, long product names and responsive behavior. Never show raw JWT secrets, password hashes or full bank account numbers.

Core user navigation: Tổng quan, Tạo link, Link của tôi, Đơn hàng, Cashback, Ví của tôi, Rút tiền, Tài khoản. Mobile bottom navigation: Tổng quan, Tạo link, Đơn hàng, Ví, Tài khoản.

Core admin navigation groups: Tổng quan; Người dùng/Sản phẩm/Affiliate links; Đơn hàng/Commission/Cashback/Ví/Yêu cầu rút tiền; Reconciliation/Provider sync/Adjustments; Audit logs/System health/Configuration.

Do not invent click tracking, instant cashback, automatic payouts, crypto, points, multiple currencies, marketplace browsing, or editable Affiliate IDs.
```

---

## 17. Prompt generate theo màn hình

Google Stitch thường cho kết quả tốt hơn khi generate từng màn hình thay vì yêu cầu toàn bộ app trong một lần. Luôn ghép “Prompt nền” ở trên với một prompt màn hình bên dưới.

### Screen A — User Generate Link

```text
Create the key user screen “Tạo link cashback” in desktop 1440px and mobile 390px. Include a large Shopee URL input with paste and clear actions, a primary “Kiểm tra sản phẩm” button, a three-step progress indicator (Kiểm tra link, Lấy sản phẩm, Tạo link), a product preview with image/name/shop/price/rating/sales/Xtra badge/estimated cashback disclaimer, and a success result with read-only generated URL plus Copy, Open Shopee and Share actions. Show default, loading skeleton, invalid link, provider timeout and success states. The screen must feel fast, reassuring and simple.
```

### Screen B — User Dashboard

```text
Create a mobile-first user dashboard. Include greeting, prominent “Tạo link cashback” CTA, three clearly distinct money cards for Ước tính, Đã xác nhận and Có thể rút, recent affiliate links with product thumbnails, recent order/cashback timeline, and a concise explanation that cashback is withdrawable only after provider payment. Include first-user empty state and populated state. Do not display click statistics or platform revenue.
```

### Screen C — User Wallet and Withdrawal

```text
Create a user wallet page and withdrawal request flow. Show withdrawable balance, reserved balance, pending cashback, append-only ledger transactions, bank account selector with masked numbers, VND amount input, manual-processing notice, confirmation summary and withdrawal status timeline. Include PENDING, PROCESSING, COMPLETED, REJECTED and FAILED states. Make reversal and reserve/release transactions understandable without deleting history.
```

### Screen D — Admin Dashboard

```text
Create a desktop-first admin operations dashboard at 1440px. Use a grouped sidebar. Show operational KPIs, provider/system health, commission versus cashback trend, pending withdrawal queue, reconciliation mismatch queue and recent admin actions. Prioritize actionable queues over decorative charts. Add last-updated timestamps and skeleton/error states.
```

### Screen E — Admin Users and User Detail

```text
Create an admin users table and user detail page. Include search, role/status filters, pagination, create/edit actions, ACTIVE/DISABLED/DELETED badges and confirmation dialogs. The detail page uses tabs for overview, bank accounts, affiliate links, orders, cashback, wallet, withdrawals and audit. Never show passwords. SUPER_ADMIN role/status changes require a reason and explicit confirmation.
```

### Screen F — Admin Products and Affiliate Links

```text
Create admin product management and affiliate link management screens. Product rows include thumbnail, itemId, shopId, name, shop, price, rating, sales, commission rate and last update. Product detail shows price statistics and source freshness. Affiliate link rows include user, product, origin/clean/generated link, channel, convert origin, status and created date, with compact copy/open actions. Technical sub IDs appear only in an expandable admin detail section.
```

### Screen G — Admin Reconciliation

```text
Create a desktop reconciliation workspace. Include batch list, CSV/XLSX import wizard, batch progress summary, result tabs and a two-column Internal versus Provider comparison. Highlight exact amount/status differences. Provide resolution actions Accept External, Keep Internal, Manual Adjustment and Ignore; every action requires a reason and shows audit actor/time. Support MATCHED, AMOUNT_MISMATCH, STATUS_MISMATCH, MISSING_INTERNAL, MISSING_EXTERNAL, DUPLICATED and MANUAL_REVIEW states.
```

### Screen H — Admin Withdrawal Detail

```text
Create an admin withdrawal work queue and detail page. Show user, integer VND amount, masked approved bank account snapshot, wallet balance snapshot, request time and status. Actions are Mark Processing, Complete, Reject and Mark Failed. Complete requires transfer reference; Reject/Failed require reason. Clearly preview the wallet reserve/debit/release effect before confirmation.
```

---

## 18. UI acceptance checklist

Một bộ thiết kế được xem là đạt khi:

- Có desktop và mobile cho luồng tạo link.
- User và Admin dùng chung token nhưng khác app shell phù hợp công việc.
- Luồng affiliate → order → commission → cashback → wallet → withdrawal được phản ánh đúng.
- Saffi chỉ xuất hiện trong đối soát/admin operations, không xuất hiện như bước generate link.
- Tỷ lệ 85/15 được mô tả đúng và platform share không lộ ở user UI.
- Ba mức tiền estimated/validated/available không bị gộp.
- Có loading, empty, error và permission state.
- Bảng admin hỗ trợ filter, pagination, long IDs và long product names.
- Bank data được mask; audit và wallet ledger là read-only.
- Màu hồng nhạt–trắng rõ nhận diện nhưng CTA vẫn đạt contrast.
- Không thêm nghiệp vụ ngoài phạm vi đã liệt kê.
- Các màn hình tương lai có thể đặt sau feature flags mà không phá navigation hiện tại.

---

## 19. Nguồn sự thật và lưu ý triển khai

- Backend hiện dùng prefix `/api/v1` và JWT access/refresh token.
- API hiện có:
  - `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout`.
  - `POST /generate-affiliate` cho luồng user tạo link.
  - `GET/PATCH/DELETE /affiliate` và `/affiliate/:id` cho quản trị link.
  - CRUD `/users` và `/products` cho Admin/Super Admin.
  - `GET /health` public.
- Users, Products và Affiliate management dành cho Admin/Super Admin; generate affiliate link cho USER/ADMIN/SUPER_ADMIN.
- Các API Orders, Commissions, Cashback, Wallet, Withdrawals, Reconciliation và Audit chưa được implement tại thời điểm viết tài liệu.
- Không hard-code frontend theo response provider. Frontend chỉ dùng DTO nội bộ đã normalize.
- Dữ liệu tiền và external IDs phải được frontend nhận dưới dạng string/integer-safe representation khi cần để tránh mất độ chính xác.
