# TÀI LIỆU BÀN GIAO TOÀN DIỆN HỆ THỐNG BUYBACK / NEXORAVN

> **Dành cho Developer tiếp nhận dự án**: Tài liệu này mô tả chi tiết 100% tất cả các luồng dữ liệu, nghiệp vụ tài chính, cấu trúc cơ sở dữ liệu, các hàm xử lý cốt lõi (Core Functions) và hướng dẫn vận hành hệ thống Cashback Affiliate.

---

## MỤC LỤC

1. [Tổng quan Kiến trúc Hệ thống (System Architecture)](#1-tổng-quan-kiến-trúc-hệ-thống)
2. [Cơ sở dữ liệu & Các thực thể cốt lõi (Database Schema)](#2-cơ-sở-dữ-liệu--các-thực-thể-cốt-lõi)
3. [Luồng 1: Tạo Link Affiliate & Cấu trúc UTM Tracking](#3-luồng-1-tạo-link-affiliate--cấu-trúc-utm-tracking)
4. [Luồng 2: Đối soát dữ liệu AddLiveTag (Reconciliation Engine)](#4-luồng-2-đối-soát-dữ-liệu-addlivetag-reconciliation-engine)
5. [Luồng 3: Kỳ quyết toán hoa hồng (Settlement Engine)](#5-luồng-3-kỳ-quyết-toán-hoa-hồng-settlement-engine)
6. [Luồng 4: Sổ cái ví tiền & Biến động số dư (Wallet Ledger)](#6-luồng-4-sổ-cái-ví-tiền--biến-động-số-dư-wallet-ledger)
7. [Luồng 5: Quản lý Ngân hàng & Quy trình Rút tiền (Withdrawals)](#7-luồng-5-quản-lý-ngân-hàng--quy-trình-rút-tiền-withdrawals)
8. [Danh mục API Endpoints chi tiết](#8-danh-mục-api-endpoints-chi-tiết)
9. [Biến môi trường (.env) & Checklist Triển khai Production](#9-biến-môi-trường-env--checklist-triển-khai-production)
10. [Bảng mã lỗi (Error Codes) & Hướng dẫn Troubleshooting](#10-bảng-mã-lỗi-error-codes--hướng-dẫn-troubleshooting)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

### 1.1. Mục tiêu sản phẩm

Hệ thống **BuyBack / NexoraVN** là nền tảng **Cashback Tiếp thị liên kết (Affiliate Cashback)** cho sàn thương mại điện tử (Shopee) thông qua cổng phân phối **AddLiveTag**.

- Người dùng dán link Shopee vào ứng dụng ➔ Hệ thống tạo link affiliate cá nhân hóa gắn mã định danh UTM.
- Khi người dùng mua hàng qua link đó ➔ Shopee ghi nhận đơn hàng ➔ AddLiveTag thu thập dữ liệu hoa hồng.
- Định kỳ, hệ thống đối soát dữ liệu với AddLiveTag API ➔ Khớp đơn hàng về đúng người dùng ➔ Tính tỷ lệ hoàn tiền **85%** (cho user) và **15%** (phí nền tảng).
- Admin lập Kỳ quyết toán (Settlement) khi nhận được tiền thanh toán từ mạng tiếp thị ➔ Tiền được cộng vào số dư khả dụng của Ví.
- Người dùng có thể yêu cầu Rút tiền về tài khoản ngân hàng cá nhân khi đạt hạn mức tối thiểu (50.000 đ).

### 1.2. Tech Stack

- **Runtime & Ngôn ngữ**: Node.js 24 LTS, TypeScript 5.9 (Strict ESM `"type": "module"`).
- **Framework**: NestJS 11 với HTTP Adapter **Fastify** (tối ưu hiệu năng cao).
- **ORM & Database**: Prisma ORM 7 với PostgreSQL 18 (schema riêng `aff`).
- **Validation**: Zod (Schema validation đồng bộ giữa DTO và runtime).
- **Bảo mật**: Argon2 (hash password), AES-256-GCM (mã hóa số tài khoản ngân hàng), JWT Access/Refresh tokens.
- **Log & Giám sát**: Pino Logger (`nestjs-pino`), OpenTelemetry-compatible step tracer.

### 1.3. Sơ đồ luồng dữ liệu tổng thể (End-to-End Flow)

```mermaid
flowchart TD
    subgraph S1["1. Tạo Link & Mua hàng"]
        U["User dán link Shopee"] --> GEN["GenerateAffiliateService"]
        GEN --> UTM["Sinh UTM 5 thành phần:<br/>user-link-channel-tracking-product"]
        UTM --> BUY["User click link mua trên Shopee"]
    end

    subgraph S2["2. Đối soát dữ liệu (Reconciliation)"]
        BUY --> ALT["AddLiveTag ghi nhận đơn & hoa hồng"]
        CRON["Cron Job / Admin Sync"] --> RECON["ReconciliationService.run()"]
        RECON --> CLI["AddLiveTagClient.report()"]
        CLI --> ENG["AddLiveTagEngine.publish()"]
        ENG --> MATCH["Khớp UTM với aff.affiliate_links"]
        MATCH --> COMM["Tạo aff.commissions (VALIDATED)<br/>Tạo aff.cashback_allocation (85%)"]
        COMM --> DASH["Hiển thị ở Dashboard User:<br/>'Số tiền chờ xác nhận'"]
    end

    subgraph S3["3. Quyết toán hoa hồng (Settlement)"]
        ALT_PAY["AddLiveTag chuyển tiền vào NH của Admin"] --> SET_CR["Admin tạo Settlement Batch<br/>(SettlementService.create)"]
        SET_CR --> SET_CF["Admin xác nhận quyết toán<br/>(SettlementService.confirm)"]
        SET_CF --> WALLET["WalletService.post()<br/>Type: CASHBACK_CREDIT"]
        WALLET --> AVAIL["Ví User: Cộng vào 'Bạn có thể rút'"]
    end

    subgraph S4["4. Rút tiền (Withdrawal)"]
        AVAIL --> W_REQ["User yêu cầu rút tiền<br/>(WithdrawalService.create)"]
        W_REQ --> LOCK["Khoá tiền: available -50k, reserved +50k"]
        LOCK --> AD_REV["Admin duyệt & chuyển khoản ngân hàng"]
        AD_REV --> W_DONE["WithdrawalService.transition(COMPLETED)<br/>reserved -50k ➔ Hoàn tất"]
    end
```

---

## 2. CƠ SỞ DỮ LIỆU & CÁC THỰC THỂ CỐT LÕI

Tất cả bảng đều nằm trong PostgreSQL schema `aff`:

| Tên bảng                     | Mục đích                              | Các trường quan trọng                                                                                                                                             |
| :--------------------------- | :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aff.users`                  | Người dùng hệ thống                   | `id`, `email`, `role` (`USER`, `ADMIN`, `SUPER_ADMIN`), `isActive`                                                                                                |
| `aff.affiliate_links`        | Link affiliate đã tạo                 | `id`, `userId`, `productId`, `subId1` (user), `subId2` (link), `subId3` (channel), `subId4` (tracking), `subId5` (product)                                        |
| `aff.provider_checkouts`     | Đơn hàng gốc từ AddLiveTag            | `id`, `provider` (`ADDLIVETAG:420`), `checkoutId`, `conversionState`, `netRaw`, `payload`, `sourceHash`, `revision`                                               |
| `aff.provider_orders`        | Đơn con theo từng mã kiện `order_sn`  | `id`, `provider`, `orderId`, `orderSn`, `checkoutId`, `status`, `payload`                                                                                         |
| `aff.commissions`            | Bản ghi hoa hồng đơn hàng             | `id`, `checkoutId`, `userId`, `state` (`ESTIMATED`, `VALIDATED`, `PAID`, `REJECTED`, `REVERSED`), `estimatedVnd`, `settledVnd`                                    |
| `aff.cashback_allocation`    | Tỷ lệ chia thưởng của hoa hồng        | `id`, `commissionId`, `userBps` (8500 = 85%), `userAmount`, `platformAmount`, `state` (`PENDING`, `VALIDATED`, `AVAILABLE`, `REJECTED`, `REVERSED`)               |
| `aff.wallets`                | Ví tiền người dùng                    | `id`, `userId`, `available` (số dư khả dụng rút), `reserved` (số dư đang giữ chờ rút)                                                                             |
| `aff.wallet_transactions`    | Sổ cái ghi nhật ký giao dịch ví       | `id`, `walletId`, `idempotencyKey`, `type`, `availableDelta`, `reservedDelta`, `availableAfter`, `reservedAfter`, `reference`                                     |
| `aff.settlement_batches`     | Kỳ quyết toán hoa hồng định kỳ        | `id`, `reference`, `grossVnd`, `deductionVnd`, `netVnd`, `status` (`DRAFT`, `CONFIRMED`, `CANCELLED`)                                                             |
| `aff.settlement_items`       | Chi tiết hoa hồng trong kỳ quyết toán | `id`, `settlementId`, `commissionId`, `netVnd`, `rawSnapshot`, `revisionSnapshot`                                                                                 |
| `aff.user_banks`             | Tài khoản ngân hàng rút tiền          | `id`, `userId`, `bankCode`, `bankName`, `accountHolder`, `lastFour`, `accountCiphertext`, `accountIv`, `accountTag`, `status` (`PENDING`, `APPROVED`, `REJECTED`) |
| `aff.withdrawals`            | Yêu cầu rút tiền                      | `id`, `userId`, `bankId`, `amount`, `status` (`PENDING`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`), `transferReference`, `idempotencyKey`                  |
| `aff.provider_credentials`   | Khóa API nhà cung cấp                 | `id` (`ADDLIVETAG`), `version`, `accountId`, `expectedAffiliate`, `status`, `verifiedAt`                                                                          |
| `aff.reconciliation_batches` | Lịch sử các lần chạy đối soát         | `id`, `startDate`, `endDate`, `provider`, `accountId`, `status`, `pages`, `records`, `failedRecords`                                                              |
| `aff.reconciliation_issues`  | Sự cố cần admin review                | `id`, `batchId`, `checkoutId`, `type`, `status` (`OPEN`, `RESOLVED`), `sourceHash`                                                                                |

---

## 3. LUỒNG 1: TẠO LINK AFFILIATE & CẤU TRÚC UTM TRACKING

### 3.1. File mã nguồn cốt lõi

- Controller: [`src/modules/affiliate/controllers/generate-affiliate.controller.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/affiliate/controllers/generate-affiliate.controller.ts)
- Service: [`src/modules/affiliate/services/generate-affiiliate.service.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/affiliate/services/generate-affiiliate.service.ts)
- Hàm parse UTM: [`src/modules/finance/domain/money.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/finance/domain/money.ts) ➔ `parseAttribution(utm)`

### 3.2. Cấu trúc UTM 5 thành phần (Bắt buộc & Chuẩn xác)

Khi User gửi link Shopee gốc, hệ thống bóc tách `itemId` và `shopId`, lưu sản phẩm vào `aff.products`, sau đó sinh link Affiliate chứa tham số UTM gồm đúng 5 thành phần nối nhau bởi dấu gạch ngang (`-`):

$$\text{UTM} = \text{subId1} - \text{subId2} - \text{subId3} - \text{subId4} - \text{subId5}$$

1. **`subId1` (User ID)**: UUID của user bỏ dấu gạch ngang (32 ký tự hex), ví dụ: `ecccac071e754c8881c9ba72f44d123e`.
2. **`subId2` (Link ID)**: UUID của bản ghi link affiliate bỏ dấu gạch ngang (32 ký tự hex), ví dụ: `a76d7fd4eef54d1caf729c917bb3e435`.
3. **`subId3` (Channel)**: Môi trường tạo link, mặc định là `web` hoặc `app`.
4. **`subId4` (Tracking Token)**: Chuỗi ngẫu nhiên định danh click, bắt đầu bằng tiền tố `bb_` (hoặc `bb`) dài từ 20 đến 32 ký tự.
5. **`subId5` (Product ID)**: UUID của sản phẩm bỏ dấu gạch ngang (32 ký tự hex), ví dụ: `ea24142232db4d9ebc7656b361e291bd`.

Ví dụ một chuỗi UTM hoàn chỉnh:

```text
ecccac071e754c8881c9ba72f44d123e-a76d7fd4eef54d1caf729c917bb3e435-web-bbf091f14e9c084574a4b79fa6a9940fb2-ea24142232db4d9ebc7656b361e291bd
```

> [!IMPORTANT]
> **Điểm mấu chốt khi giải mã UTM**: AddLiveTag đôi khi trả về `subId4` bị mất dấu gạch dưới (ví dụ `bbf091...` thay vì `bb_f091...`). Hàm khớp nối trong `addlivetag-engine.ts` đã được xử lý dùng `.replaceAll('_', '')` để luôn bảo đảm khớp 100%.

---

## 4. LUỒNG 2: ĐỐI SOÁT DỮ LIỆU ADDLIVETAG (RECONCILIATION ENGINE)

### 4.1. File mã nguồn cốt lõi

- Điều phối & Cron: [`src/modules/reconciliation/reconciliation.service.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/reconciliation/reconciliation.service.ts)
- Engine xử lý đơn: [`src/modules/reconciliation/addlivetag-engine.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/reconciliation/addlivetag-engine.ts)
- Trạng thái hoa hồng: [`src/modules/reconciliation/commission-status.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/reconciliation/commission-status.ts)
- API Client: [`src/modules/reconciliation/addlivetag.client.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/reconciliation/addlivetag.client.ts)

### 4.2. Trình tự thực thi một đợt đối soát (Reconciliation Lifecycle)

1. **Khởi tạo Batch (`enqueue` / `enqueueRange`)**:
   - Admin bấm "Đồng bộ" trên trang Admin hoặc Cron job kích hoạt (`hourly` vào phút thứ 10 mỗi giờ, `nightly` lúc 02:15 sáng).
   - Kiểm tra `Credential`: `accountId: "420"`, `expectedAffiliate: "theanh.nguyen2039"`.
   - Tạo bản ghi `aff.reconciliation_batches` với trạng thái `QUEUED`.
2. **Thu thập dữ liệu qua API (`ReconciliationService.run`)**:
   - Phân trang lặp (`page=1` đến khi hết đơn).
   - Gọi `AddLiveTagClient.report(apiKey, accountId, startDate, endDate, page)`.
   - Lưu trữ snapshot thô vào `aff.reconciliation_pages` và `aff.conversion_item_snapshots`.
   - Gom các dòng sản phẩm (`ConversionItem`) có cùng `checkout_id` thành một cụm `groups = Map<checkout_id, ConversionItem[]>`.
3. **Phân tích và Ghi nhận (`AddLiveTagEngine.publish`)**:
   - Duyệt qua từng `checkout_id`:
     - **Hash phiên bản snapshot**: `checkoutDigest(rows)` tạo mã băm sha256 bắt đầu với `commission-payment-v3:`. Nếu dữ liệu không thay đổi so với lần trước thì bỏ qua (idempotent).
     - **Kiểm tra đơn hàng (`inspectCheckout`)**:
       - `status_code` hợp lệ gồm: `completed`, `paid`, `cancelled`.
       - Lấy `item_id` từ `item_url`.
     - **Bóc tách UTM & Tìm User**:
       - Gọi `parseAttribution(utm)`.
       - Tìm link trong database: `tx.affiliateLink.findUnique({ where: { subId2: a.link } })`.
       - Kiểm tra tính toàn vẹn: `link.userId == a.user`, `link.productId == a.product`, `link.subId4 == a.tracking`.
       - Nếu đúng ➔ Gán `userId = link.userId`, `affiliateLinkId = link.id`.
       - Nếu không khớp hoặc UTM là `----` ➔ Thêm lỗi `INVALID_ATTRIBUTION`, đưa vào `aff.reconciliation_issues` để Admin xem xét.
     - **Xác định trạng thái hoa hồng (`commission.state`)**:
       - Nếu có issue chưa giải quyết ➔ `MANUAL_REVIEW`.
       - Nếu đơn bị huỷ (`status_code: cancelled`) ➔ `REJECTED`, hoa hồng 0đ.
       - Nếu đơn hoàn thành / đã thanh toán: Kiểm tra `paymentBlockers(rows)`.
         - Khi biến môi trường `ADDLIVETAG_PAID_COMMISSION_STATUSES` chứa các trạng thái của đơn (`Chờ trả hoa hồng|Chưa chốt|Đã thanh toán|paid`) ➔ `commissionPaymentState` trả về `PAID`.
         - `paymentBlockers` trả về mảng rỗng `[]` ➔ Trạng thái hoa hồng là **`VALIDATED`**!
     - **Ghi nhận hoa hồng & hoàn tiền**:
       - `tx.commission.upsert(...)`: Ghi nhận `state`, `rawAmount`, `estimatedVnd`.
       - `this.cashback(...)`: Tính tỷ lệ 85% hoa hồng cho user:
         $$\text{userAmount} = \lfloor \text{estimatedVnd} \times 8500 / 10000 \rfloor$$
         $$\text{platformAmount} = \text{estimatedVnd} - \text{userAmount}$$
       - Ghi vào bảng `aff.cashback_allocation` với `state: VALIDATED` (hoặc `PENDING` nếu chưa đủ điều kiện chi trả).

---

## 5. LUỒNG 3: KỲ QUYẾT TOÁN HOA HỒNG (SETTLEMENT ENGINE)

> [!NOTE]
> **Nguyên tắc vàng của hệ thống**: Việc đối soát chỉ ghi nhận hoa hồng và tạo khoản hoàn tiền tạm tính. **Tiền thực tế chỉ được cộng vào số dư khả dụng của ví khi Admin xác nhận Kỳ quyết toán (Settlement Confirm).**

### 5.1. File mã nguồn cốt lõi

- Dịch vụ: [`src/modules/finance/settlement.service.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/finance/settlement.service.ts)
- Kiểm tra tính đủ điều kiện: [`src/modules/finance/settlement-eligibility.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/finance/settlement-eligibility.ts)

### 5.2. Điều kiện một Commission được đưa vào Quyết toán (`settlement-eligibility.ts`)

Một khoản hoa hồng chỉ có thể được chọn vào kỳ quyết toán khi thỏa mãn tất cả:

1. `commission.state === 'VALIDATED'`.
2. Có người dùng thụ hưởng: `commission.userId !== null`.
3. Chưa từng nằm trong kỳ quyết toán nào khác: `commission.settlementItem == null`.
4. Không có issue đối soát nào đang mở (`OPEN_RECONCILIATION_ISSUES`).
5. Credential của provider đang `ACTIVE` và đã xác thực `verifiedAt`.

### 5.3. Quy trình Quyết toán

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Super Admin
    participant UI as Admin Portal (/admin/settlements)
    participant SS as SettlementService
    participant WS as WalletService
    participant DB as Database (aff)

    Admin->>UI: Chọn các Commission đã VALIDATED
    Admin->>UI: Nhập Gross VND, Khấu trừ, Net VND thực nhận
    UI->>SS: POST /api/v1/admin/settlements (create)
    SS->>DB: Tạo SettlementBatch (status: DRAFT) & SettlementItems
    SS-->>UI: Trả về Settlement Batch ID

    Admin->>UI: Bấm "Xác nhận kỳ quyết toán"
    UI->>SS: POST /api/v1/admin/settlements/:id/confirm
    SS->>SS: Kiểm tra SETTLEMENT_ENABLED=true
    loop Cho từng item trong Batch
        SS->>DB: Cập nhật Commission.state = 'PAID'
        SS->>DB: Cập nhật CashbackAllocation.state = 'AVAILABLE'
        SS->>WS: post(type: 'CASHBACK_CREDIT', available: +userAmount)
        WS->>DB: Tăng aff.wallets.available
        WS->>DB: Tạo aff.wallet_transactions (CASHBACK_CREDIT)
    end
    SS->>DB: Cập nhật SettlementBatch.status = 'CONFIRMED'
    SS-->>UI: Hoàn tất (Tiền đã vào ví User)
```

---

## 6. LUỒNG 4: SỔ CÁI VÍ TIỀN & BIẾN ĐỘNG SỐ DƯ (WALLET LEDGER)

### 6.1. File mã nguồn cốt lõi

- Dịch vụ: [`src/modules/finance/wallet.service.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/finance/wallet.service.ts) ➔ Hàm `post(tx, input)`

### 6.2. Cơ chế Sổ cái Bất biến (Immutable Ledger)

Mỗi User có một ví tại bảng `aff.wallets`:

- `available`: Số dư khả dụng (tiền có thể rút).
- `reserved`: Số dư đóng băng (tiền đang trong lệnh rút chờ xử lý).

Mọi thay đổi số dư **bắt buộc** phải đi qua `WalletService.post` để ghi nhận vào bảng `aff.wallet_transactions`. Không bao giờ được phép `update` trực tiếp số dư ví ở ngoài service này.

### 6.3. Bảng phân loại giao dịch Ví (`type`)

| Transaction Type      | `availableDelta` | `reservedDelta` | Ý nghĩa nghiệp vụ                                                          |
| :-------------------- | :--------------: | :-------------: | :------------------------------------------------------------------------- |
| `CASHBACK_CREDIT`     |    `+amount`     |       `0`       | Tiền hoàn được cộng vào ví khi Admin chốt kỳ quyết toán                    |
| `WITHDRAWAL_RESERVE`  |    `-amount`     |    `+amount`    | Tiền bị đóng băng khi User tạo lệnh rút tiền                               |
| `WITHDRAWAL_COMPLETE` |       `0`        |    `-amount`    | Giải phóng tiền đóng băng khi Admin đã chuyển khoản ngân hàng thành công   |
| `WITHDRAWAL_RELEASE`  |    `+amount`     |    `-amount`    | Hoàn trả lại tiền vào số dư khả dụng khi lệnh rút bị từ chối hoặc thất bại |
| `CASHBACK_REVERSAL`   |    `-amount`     |       `0`       | Thu hồi hoa hồng nếu sàn AddLiveTag huỷ đơn sau khi đã thanh toán          |
| `MANUAL_ADJUSTMENT`   |    `±amount`     |       `0`       | Admin can thiệp điều chỉnh số dư thủ công (kèm lý do)                      |

---

## 7. LUỒNG 5: QUẢN LÝ NGÂN HÀNG & QUY TRÌNH RÚT TIỀN (WITHDRAWALS)

### 7.1. File mã nguồn cốt lõi

- Ngân hàng: [`src/modules/finance/bank.service.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/finance/bank.service.ts)
- Rút tiền: [`src/modules/finance/withdrawal.service.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/finance/withdrawal.service.ts)
- Mã hoá: [`src/modules/finance/crypto.service.ts`](file:///Users/agn-imac003/Documents/theanh/nexora/BuyBack-NexoraVN-BackEnd/src/modules/finance/crypto.service.ts)

### 7.2. Bảo mật Tài khoản Ngân hàng (PCI-DSS Style Encryption)

- Khi user gửi số tài khoản: `crypto.encrypt(accountNumber, 'bank:' + id)` dùng thuật toán **AES-256-GCM**.
- Database **không lưu plaintext** số tài khoản. DB chỉ lưu `lastFour` (4 số cuối) để hiển thị giao diện, kèm theo `accountCiphertext`, `accountIv`, `accountTag`.
- Khi cập nhật tài khoản mới, tài khoản cũ được soft-delete (`deleteAt`) để lưu vết lịch sử phiên bản (`version`).
- Tài khoản mới tạo có trạng thái `PENDING`. Admin phải duyệt (`APPROVED`) thì user mới được chọn để rút tiền.

### 7.3. Trạng thái Vòng đời Lệnh rút tiền (`aff.withdrawals.status`)

```mermaid
stateDiagram-v2
    [*] --> PENDING: User tạo yêu cầu rút (Available >= 50.000 đ)
    note right of PENDING: Tiền bị khoá: Available -amount, Reserved +amount

    PENDING --> REJECTED: Admin từ chối lệnh rút
    note right of REJECTED: Hoàn tiền ngay: Available +amount, Reserved -amount

    PENDING --> PROCESSING: Admin bắt đầu xử lý chuyển khoản
    PROCESSING --> COMPLETED: Admin chuyển khoản xong, nhập mã GD
    note right of COMPLETED: Hoàn tất: Reserved -amount

    PROCESSING --> FAILED: Chuyển khoản thất bại (lỗi STK,...)
    note right of FAILED: Hoàn tiền ngay: Available +amount, Reserved -amount
```

---

## 8. DANH MỤC API ENDPOINTS CHI TIẾT

### 8.1. Phân hệ Người dùng (`/api/v1/me/...`)

Tất cả endpoint yêu cầu header `Authorization: Bearer <user_access_token>`.

| Phương thức | Đường dẫn                        | Chức năng                         | Output chính                                       |
| :---------- | :------------------------------- | :-------------------------------- | :------------------------------------------------- |
| `GET`       | `/api/v1/me/dashboard`           | Thống kê tổng quan ví & đơn hàng  | Số dư `available`, `reserved`, tổng chờ duyệt      |
| `GET`       | `/api/v1/me/wallet`              | Lấy chi tiết số dư ví             | `{ userId, available, reserved }`                  |
| `GET`       | `/api/v1/me/wallet/transactions` | Lịch sử biến động số dư           | Danh sách giao dịch ví (`CASHBACK_CREDIT`,...)     |
| `GET`       | `/api/v1/me/orders`              | Danh sách đơn hàng đã mua         | Chi tiết đơn, trạng thái hoàn thành                |
| `GET`       | `/api/v1/me/cashbacks`           | Danh sách các khoản tiền hoàn     | Tỷ lệ user (85%), trạng thái `PENDING`/`AVAILABLE` |
| `GET`       | `/api/v1/me/bank-accounts`       | Danh sách tài khoản ngân hàng     | Ngân hàng, tên chủ thẻ, 4 số cuối, trạng thái      |
| `POST`      | `/api/v1/me/bank-accounts`       | Thêm tài khoản ngân hàng mới      | Trạng thái ban đầu `PENDING`                       |
| `GET`       | `/api/v1/me/withdrawals`         | Lịch sử các yêu cầu rút tiền      | Mã yêu cầu, số tiền, trạng thái (`PENDING`,...)    |
| `POST`      | `/api/v1/me/withdrawals`         | Tạo yêu cầu rút tiền về ngân hàng | Hạn mức $\ge$ 50.000 đ, khóa tiền ví ngay lập tức  |

### 8.2. Phân hệ Quản trị (`/api/v1/admin/...`)

Yêu cầu header `Authorization: Bearer <admin_or_super_admin_token>`.

| Phương thức | Đường dẫn                                         |  Quyền hạn  | Chức năng                                                    |
| :---------- | :------------------------------------------------ | :---------: | :----------------------------------------------------------- |
| `POST`      | `/api/v1/admin/reconciliation/sync`               |    ADMIN    | Kích hoạt chạy đối soát thủ công theo khoảng ngày            |
| `GET`       | `/api/v1/admin/reconciliation/batches`            |    ADMIN    | Danh sách các đợt đối soát đã chạy                           |
| `GET`       | `/api/v1/admin/reconciliation/issues`             |    ADMIN    | Danh sách các lỗi/vấn đề cần review thủ công                 |
| `POST`      | `/api/v1/admin/reconciliation/issues/:id/resolve` | SUPER_ADMIN | Phê duyệt hoặc loại bỏ checkout có vấn đề                    |
| `GET`       | `/api/v1/admin/commissions`                       |    ADMIN    | Danh sách hoa hồng (kèm cờ `settlementEligibility`)          |
| `POST`      | `/api/v1/admin/settlements`                       | SUPER_ADMIN | Tạo kỳ thanh toán nháp (`DRAFT`) từ các commission           |
| `POST`      | `/api/v1/admin/settlements/:id/confirm`           | SUPER_ADMIN | **Xác nhận kỳ thanh toán ➔ CỘNG TIỀN VÀO VÍ USER**           |
| `POST`      | `/api/v1/admin/settlements/:id/cancel`            | SUPER_ADMIN | Hủy kỳ thanh toán nháp                                       |
| `POST`      | `/api/v1/admin/bank-accounts/:id/approve`         |    ADMIN    | Phê duyệt tài khoản ngân hàng của user                       |
| `PATCH`     | `/api/v1/admin/withdrawals/:id/status`            |    ADMIN    | Cập nhật trạng thái rút tiền (`PROCESSING`, `COMPLETED`,...) |
| `POST`      | `/api/v1/admin/withdrawals/:id/payment-details`   |    ADMIN    | **Giải mã xem số tài khoản ngân hàng** để thực hiện CK       |
| `POST`      | `/api/v1/admin/wallet-adjustments`                | SUPER_ADMIN | Can thiệp cộng/trừ số dư ví thủ công kèm lý do               |

---

## 9. BIẾN MÔI TRƯỜNG (.ENV) & CHECKLIST TRIỂN KHAI PRODUCTION

### 9.1. Danh sách biến môi trường bắt buộc

```ini
# COMMON
NODE_ENV=production
PORT=8080
CORS_ORIGINS=https://your-frontend-domain.com

# DATABASE (Azure PostgreSQL)
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require&schema=aff"

# JWT SECRETS (Tối thiểu 32 ký tự, không được trùng nhau)
JWT_ACCESS_SECRET=c29tZS1zdXBlci1zZWNyZXQtYWNjZXNzLWtleS1hdC1sZWFzdC0zMg==
JWT_REFRESH_SECRET=c29tZS1zdXBlci1zZWNyZXQtcmVmcmVzaC1rZXktYXQtbGVhc3QtMzI=

# AFFILIATE & FINANCE
SHOPEE_AFFILIATE_ID=17303170528
FINANCE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# ROLLOUT FEATURE GATES (Bắt buộc = true trên production)
RECONCILIATION_ENABLED=true
SETTLEMENT_ENABLED=true
WITHDRAWALS_ENABLED=true

# ADDLIVETAG INTEGRATION
ADDLIVETAG_API_KEY=fb0aa9ac433db11791a001157f3985b02c2626cc73905430
ADDLIVETAG_PAID_COMMISSION_STATUSES="Chờ trả hoa hồng|Chưa chốt|Đã thanh toán|paid"
```

### 9.2. Checklist bàn giao trước khi vận hành

- [x] Database đã chạy migration mới nhất (`pnpm prisma:migrate:deploy`).
- [x] Bảng `aff.provider_credentials` có bản ghi `ADDLIVETAG` với `accountId = "420"`, `expectedAffiliate = "theanh.nguyen2039"`, `status = "ACTIVE"`, `verifiedAt != null`.
- [x] Biến `SETTLEMENT_ENABLED=true` và `WITHDRAWALS_ENABLED=true` đã bật trên Railway.
- [x] Biến `ADDLIVETAG_PAID_COMMISSION_STATUSES` chứa các nhãn trạng thái từ AddLiveTag để đơn hàng tự động đủ điều kiện quyết toán.

---

## 10. BẢNG MÃ LỖI (ERROR CODES) & HƯỚNG DẪN TROUBLESHOOTING

| Mã lỗi                           | Nguyên nhân                                                                                     | Cách khắc phục                                                                                              |
| :------------------------------- | :---------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| `INVALID_ATTRIBUTION`            | Chuỗi UTM không đúng 5 thành phần hoặc không tìm thấy `subId2` trong bảng `aff.affiliate_links` | Kiểm tra đơn hàng xem user có mua qua link BuyBack không; nếu mua ngoài thì không thể tự động chia hoa hồng |
| `COMMISSIONS_NOT_ELIGIBLE`       | Admin chọn commission chưa `VALIDATED` vào kỳ thanh toán                                        | Đảm bảo đơn hàng đã hoàn thành và `ADDLIVETAG_PAID_COMMISSION_STATUSES` đã được cấu hình trên server        |
| `SETTLEMENT_DISABLED`            | Gọi confirm quyết toán nhưng biến môi trường chưa bật                                           | Đặt `SETTLEMENT_ENABLED=true` trên Railway/server                                                           |
| `WITHDRAWALS_DISABLED`           | User gọi rút tiền nhưng tính năng chưa kích hoạt                                                | Đặt `WITHDRAWALS_ENABLED=true` trên Railway/server                                                          |
| `MINIMUM_WITHDRAWAL_50000`       | Số tiền rút nhỏ hơn 50.000 đ                                                                    | Hạn mức rút tối thiểu là 50.000 đ (cấu hình trong `aff.affiliate_policies`)                                 |
| `INSUFFICIENT_AVAILABLE_BALANCE` | Số dư khả dụng của ví nhỏ hơn số tiền muốn rút                                                  | Kiểm tra lại ô "Bạn có thể rút" của user                                                                    |
| `APPROVED_BANK_REQUIRED`         | Tài khoản ngân hàng được chọn chưa được Admin duyệt                                             | Admin vào `/admin/bank-accounts` bấm duyệt tài khoản ngân hàng trước                                        |
| `WALLET_HAS_CLAWBACK_DEBT`       | Ví user đang có số dư âm (do bị sàn phạt huỷ đơn trước đó)                                      | User cần tích lũy thêm đơn mới để bù khoản nợ trước khi tiếp tục rút                                        |
