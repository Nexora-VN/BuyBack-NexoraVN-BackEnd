# BUYBACK BY NEXORAVN — COMPLETE ONE-SHOT UI GENERATION SPEC

## Execution directive

Use this Markdown file as the complete and final design brief. Generate the entire BuyBack product UI in one project and one render pass. Do not ask for additional prompts, do not omit screens, and do not replace detailed screens with placeholders.

Create one cohesive responsive design system and all specified User App and Admin Backoffice screens. Use production-quality Vietnamese copy and realistic data. The output must look like one real product, not unrelated concept screens.

Organize the generated project into these clearly named sections:

1. `00 — Design System`
2. `01 — Authentication`
3. `02 — User App Desktop`
4. `03 — User App Mobile`
5. `04 — Admin Backoffice`
6. `05 — States and Dialogs`

Generate desktop frames at 1440px, user mobile frames at 390px, and admin tablet examples at 1024px where specified.

All visible interface copy must be Vietnamese. Component and frame names may use English prefixes for organization.

---

## 1. Product definition

Product name: **BuyBack by NexoraVN**.

BuyBack is a Vietnamese Shopee affiliate cashback platform. It is not an ecommerce marketplace and does not sell products directly.

Primary flow:

```text
Người dùng đăng nhập
→ Dán short link hoặc long link Shopee
→ Hệ thống kiểm tra và làm sạch URL
→ Hệ thống lấy thông tin sản phẩm
→ Hệ thống tạo affiliate link trực tiếp bằng Shopee an_redir
→ Người dùng sao chép link và mua hàng trên Shopee
→ Saffi cung cấp dữ liệu đối soát đơn hàng
→ Commission được xác nhận và thanh toán
→ 85% commission trở thành cashback cho user
→ 15% là doanh thu platform
→ Cashback AVAILABLE được cộng vào ví
→ User gửi yêu cầu rút tiền
→ Admin chuyển khoản thủ công và cập nhật trạng thái
```

Critical business truths that the UI must preserve:

- One platform Affiliate ID is used for all users. Never expose it as an editable user setting.
- Affiliate links are generated directly by the system. Saffi is used only for reconciliation.
- There is no internal click tracking in V1. Never invent click counts or click analytics.
- Estimated cashback is not guaranteed.
- Validated cashback is not yet withdrawable.
- Only `AVAILABLE` cashback is included in withdrawable balance.
- All money is integer VND.
- Wallet transactions are append-only ledger records.
- Withdrawals are manually processed by admins, not automatically paid.
- Reversals, refunds and clawbacks remain visible in transaction history.
- Admin financial changes require reasons and audit records.

---

## 2. User roles

### USER

- Generate affiliate links.
- View own links and product information.
- View own orders, cashback, wallet, bank accounts and withdrawals.
- Never see another user’s data, raw provider payload or platform revenue.

### ADMIN

- Manage users, products and affiliate links.
- Operate orders, commissions, cashback, wallets and withdrawals.
- Run reconciliation and resolve mismatches.
- Financial adjustments always require a reason.

### SUPER_ADMIN

- All Admin abilities.
- Manage roles, system/provider configuration and audit access.
- Destructive or high-risk actions require explicit confirmation.

The navigation structure must support future roles such as Finance, Support and Reconciliation Staff without redesigning the entire sidebar.

---

## 3. Brand and visual system

### Brand personality

Create a trustworthy, transparent, calm and modern fintech experience using soft pink and white. It must not look childish, overly feminine, decorative or similar to Shopee’s orange visual identity.

Avoid hearts, glitter, neon gradients, excessive illustrations, glassmorphism and oversized floating cards.

Use product thumbnails as natural visual color. Keep application chrome restrained.

### Color tokens

```text
Brand pressed             #A72D61
Primary CTA               #C83F77
Brand accent              #E05B91
Active border             #F3B7CF
Soft pink surface         #FBE4ED
Page tint                 #FFF5F9
Main white surface        #FFFFFF
Canvas                    #FFFAFC
Border                    #EEDDE5
Primary text              #2B1D24
Secondary text            #725F68
Disabled text             #A6949D
Success                   #16845B
Success background        #E9F7F1
Warning                   #A96813
Warning background        #FFF5DC
Information               #3568C9
Information background    #EAF1FF
Danger                    #C23B55
Danger background         #FDECEF
Manual review             #7752A8
Review background         #F2ECFA
Neutral                   #6F6670
Neutral background        #F2EFF1
```

Primary buttons use `#C83F77` with white text. Never place white text on pale pink.

### Typography

- Primary font: `Be Vietnam Pro`.
- Fallback: `Inter`, system sans-serif.
- Desktop page title: 28–32px.
- Mobile page title: 24–28px.
- Section title: 20–24px.
- Body: 14–16px.
- Table text: minimum 13px.
- Monetary values: tabular numerals, weight 600–700.

### Shape and layout

- 4px/8px spacing system.
- Card radius: 16px.
- Inputs and buttons: 10–12px radius.
- Status badges: pill shape.
- Light borders and subtle shadows.
- User content max width: approximately 1200px.
- Admin sidebar: 248px desktop, collapsible icon rail on tablet.
- Table rows: 48–56px.
- Minimum touch target: 44×44px.
- WCAG AA contrast and visible keyboard focus rings.

### Iconography

Use one consistent rounded outline icon family. Core icons: home, link, shopping bag, coins, wallet, bank, withdrawal, users, product, refresh/sync, shield/audit, settings and logout.

---

## 4. Shared components to generate

Build a reusable component sheet containing:

- Logo lockup and compact app mark.
- User desktop sidebar/top bar.
- User mobile header and five-item bottom navigation.
- Admin grouped sidebar, top header, breadcrumb and account menu.
- Primary, secondary, tertiary, icon and danger buttons.
- Inputs, password field, URL input, search input and VND money input.
- Select, combobox, date range picker, filter chips and filter drawer.
- Product card and compact product row.
- Balance card and KPI card.
- Semantic status badge.
- Data table with sorting, pagination, selection and column controls.
- Mobile data card replacing tables.
- Tabs, breadcrumb, stepper and status timeline.
- Wallet ledger row.
- Internal-versus-provider comparison panel.
- JSON viewer with collapsed default state.
- File upload dropzone and import wizard.
- Toast, inline alert, tooltip and popover.
- Confirmation modal with optional mandatory reason.
- Loading skeleton, empty state, error state, 403 state and 404 state.

Show default, hover, focus, active, disabled, loading and error variants for core controls.

---

## 5. Navigation

### User desktop navigation

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

### User mobile bottom navigation

```text
Tổng quan | Tạo link | Đơn hàng | Ví | Tài khoản
```

### Admin sidebar

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

Use clear active states. Show unread/action-needed counters only for real work queues such as pending withdrawals or reconciliation mismatches.

---

## 6. Generate all Authentication screens

### AUTH-01 — Login Desktop 1440px

- Split layout with restrained abstract brand graphic on the left and login card on the right.
- Logo: “BuyBack by NexoraVN”.
- Headline: “Chào mừng bạn trở lại”.
- Supporting copy: “Tạo link thông minh, theo dõi cashback minh bạch.”
- Email field.
- Password field with show/hide control.
- “Ghi nhớ đăng nhập” checkbox.
- Primary CTA: “Đăng nhập”.
- Forgot-password link shown as future-safe but visually secondary.
- No public registration CTA.
- Include inline invalid credentials and disabled-account variants.

### AUTH-02 — Login Mobile 390px

- Compact logo and centered form.
- Same inputs, validation and CTA.
- No large illustration.
- Respect mobile keyboard and safe areas.

### AUTH-03 — Session and permission states

- Full page `403 — Bạn không có quyền truy cập` with return action.
- Session-expired modal: “Phiên đăng nhập đã hết hạn”.
- Generic `404 — Không tìm thấy trang`.

---

## 7. Generate all User App screens

Create desktop and mobile versions for USER-01, USER-02, USER-03 and USER-08. Create responsive desktop-first frames plus clear mobile adaptation notes for the remaining user screens.

### USER-01 — Dashboard

- Greeting using display name: “Chào buổi sáng, An”.
- Prominent primary CTA: “Tạo link cashback”.
- Three money cards:
  - “Ước tính” — `428.000 ₫`.
  - “Đã xác nhận” — `275.500 ₫`.
  - “Có thể rút” — `186.000 ₫`, with withdrawal CTA.
- Small explanation: “Cashback chỉ có thể rút sau khi đơn hàng được đối tác thanh toán.”
- Recent affiliate links with product image, title, link status and copy action.
- Recent order/cashback timeline.
- Quick link to wallet transactions.
- Generate a populated version and first-user empty version.
- Never show click counts or platform revenue.

### USER-02 — Generate Affiliate Link: Empty/Input

- Page heading: “Tạo link cashback”.
- Description: “Dán link sản phẩm Shopee để tạo link mua hàng có tracking cashback.”
- Large URL field supporting short and long Shopee URLs.
- Inline paste and clear actions.
- Primary CTA: “Kiểm tra sản phẩm”.
- Supported-domain helper text.
- Compact three-step indicator:
  - Kiểm tra link.
  - Lấy sản phẩm.
  - Tạo link.
- Trust note explaining that the user will continue shopping on Shopee.

### USER-03 — Generate Affiliate Link: Processing and Success

Show state variants together as a coherent flow:

1. URL validation loading.
2. Product skeleton loading.
3. Product preview.
4. Affiliate link success.

Product preview data:

```text
Tên: Giá đỡ bạch tuộc chống sốc cho điện thoại gắn xe máy
Shop: Pkđt Citycase Giá Đỡ - Kẹp ĐT
Giá: 134.300 ₫
Đánh giá: 4,90
Đã bán: 1.306
Commission tham khảo: 10,5%
Cashback ước tính: 11.987 ₫
Badge: Xtra
Cập nhật: 08:20, 27/08/2026
```

Result block:

- Read-only generated affiliate URL.
- Primary “Sao chép link”.
- Secondary “Mở Shopee”.
- Tertiary “Chia sẻ”.
- Success toast: “Đã sao chép link”.
- Link to “Xem trong Link của tôi”.
- Clear disclaimer that the displayed cashback is estimated.

### USER-04 — Generate Link Error States

Place reusable error variants in the States section:

- Link trống.
- Link không hợp lệ.
- Link không thuộc Shopee.
- Không thể mở rộng short link.
- Không lấy được thông tin sản phẩm.
- Provider timeout.
- Tạo affiliate link thất bại with retry action and friendly error reference.

Do not show technical terms such as SSRF or internal stack traces.

### USER-05 — My Affiliate Links

- Search by product name or URL.
- Filter by status and date range.
- Desktop table and mobile card list.
- Fields: product thumbnail, product name, generated URL preview, channel, status and created time.
- Statuses: `Đang hoạt động`, `Hết hạn`, `Đã xóa`.
- Row actions: copy, open and details.
- Long URL truncation with tooltip.
- Populated, loading and empty states.

### USER-06 — Affiliate Link Detail

- Product summary card.
- Origin link, clean product link and generated affiliate link.
- Copy/open actions for each relevant URL.
- Link status, creation time and channel.
- Friendly tracking reference, not raw sub IDs.
- Related orders section for future attribution.
- No click graph or click count.

### USER-07 — Orders List

- Summary cards: Đang chờ, Đã xác nhận, Bị từ chối, Cần kiểm tra.
- Search order ID.
- Filters: status, provider and date range.
- Fields: order ID, product, order amount, estimated commission, expected cashback, status and purchase date.
- Mobile cards must prioritize status and cashback.
- Empty state explains that orders can appear later after provider synchronization.

### USER-08 — Order Detail

- Order overview and provider order reference.
- Product/item list.
- Purchase amount and commission/cashback summary.
- Timeline separating provider, internal and reconciliation states.
- Cancel/refund reason area when applicable.
- Clear message for pending validation.
- Related affiliate link.

### USER-09 — Cashback

- Header summary for estimated, validated and available cashback.
- Tabs: Tất cả, Đang chờ, Đã xác nhận, Khả dụng, Từ chối/Đảo chiều.
- Each row links to order and commission reference.
- Explain formula: `Commission × 85% = Cashback của bạn`.
- Do not display platform share.
- Timeline explaining why money is not yet withdrawable.

### USER-10 — Wallet

- Large hero card: “Số dư có thể rút — 186.000 ₫”.
- Secondary values: “Đang tạm giữ” and “Cashback đang chờ”.
- Primary CTA: “Rút tiền”.
- Append-only ledger with:
  - `+45.000 ₫ Cashback`.
  - `-100.000 ₫ Rút tiền`.
  - `+100.000 ₫ Hoàn tạm giữ`.
  - `-15.000 ₫ Cashback đảo chiều`.
- Each transaction includes type, reference, status and timestamp.
- Use icon plus text plus color; never color alone.
- Include filters and transaction detail drawer.

### USER-11 — Bank Accounts

- Bank account cards with bank logo/name, holder name and masked account number such as `•••• 6789`.
- Status badges: Chờ duyệt, Đã duyệt, Bị từ chối.
- CTA: “Thêm tài khoản ngân hàng”.
- Add/edit form with bank, account number, account holder and optional branch.
- Warning that the account holder should match verified identity.
- Rejection reason area.

### USER-12 — Create Withdrawal

- Withdrawable balance.
- Approved bank account selector.
- Integer VND amount input with formatting.
- Manual-processing notice.
- Review summary: amount, masked destination, expected processing information.
- Primary CTA: “Xác nhận yêu cầu rút tiền”.
- Disabled state when balance is insufficient or bank account is not approved.
- Confirmation dialog.

### USER-13 — Withdrawal History and Detail

- Status tabs and history cards/table.
- Statuses: Chờ xử lý, Đang xử lý, Hoàn tất, Từ chối, Thất bại.
- Detail timeline.
- Masked bank snapshot.
- Reject/failure reason.
- Amount and request/completion times.

### USER-14 — Profile

- Avatar initials, display name and email.
- Editable phone, display name and full name.
- Read-only role.
- Bank account shortcut.
- Security/session section.
- Logout action.
- No password hash or token information.

---

## 8. Generate all Admin Backoffice screens

Admin screens are desktop-first at 1440px. Use realistic dense operational data without making tables cramped. Provide a 1024px collapsed-sidebar example for the Dashboard and Reconciliation Detail.

### ADMIN-01 — Operations Dashboard

- Grouped sidebar and top header.
- KPI cards:
  - Tổng người dùng active.
  - Link tạo hôm nay.
  - Đơn hàng đang chờ.
  - Commission estimated.
  - Commission paid.
  - Cashback available.
  - Withdrawal pending.
- Provider/system health strip with last update.
- Commission versus cashback time-series chart.
- Pending withdrawal work queue.
- Reconciliation mismatch work queue.
- Recent admin activity.
- Prioritize actionable queues over decorative charts.

### ADMIN-02 — Users List

- Search, role filter, status filter and pagination.
- Table columns: user, email, phone, role, status, created date and actions.
- Primary CTA: “Tạo người dùng”.
- Actions: view, edit, enable/disable and soft delete according to role.
- Loading, no-results and empty states.

### ADMIN-03 — User Create/Edit and Detail

- Create/edit form in a right drawer or dedicated panel.
- User detail header with identity, role and status.
- Tabs:
  - Tổng quan.
  - Ngân hàng.
  - Affiliate links.
  - Đơn hàng.
  - Cashback.
  - Ví.
  - Rút tiền.
  - Audit.
- Role/status changes require explicit confirmation; high-risk changes require reason.
- Never display passwords.

### ADMIN-04 — Products List

- Product thumbnail.
- Item ID and Shop ID.
- Product name and shop.
- Price, sales and rating.
- Total commission rate.
- Commission amount.
- Xtra/capped badges.
- Last update and stale-data indicator.
- Search product/shop/URL and filter itemId/shopId.
- Create, view, edit and guarded delete actions.

### ADMIN-05 — Product Detail

- Large product summary.
- Provider source and last refresh.
- Commission breakdown: seller rate, Shopee rate and total rate.
- Cap information.
- Price stats: current, min, max, average, 7-day and 30-day change.
- Latest price snapshot.
- Related affiliate links.
- Delete-blocked dialog when affiliate links reference this product.
- Future refresh-data action separated from manual editing.

### ADMIN-06 — Affiliate Links List

- Search and filters for user, status, source, channel and date.
- Columns: reference, user, product, generated URL, convert origin, channel, status and created time.
- Compact copy/open actions.
- Pagination and no-results state.

### ADMIN-07 — Affiliate Link Detail

- User and product context.
- Origin, clean and generated URLs.
- Convert origin and failure code.
- Status and timestamps.
- Expandable technical section containing subId1–subId5.
- Related order attribution.
- Delete confirmation with impact explanation.

### ADMIN-08 — Orders Operations

- Dense table with sticky header and column chooser.
- Filters: provider status, internal status, reconciliation status, user, order ID, provider and date range.
- Columns: order reference, user, amount, commission, cashback, provider status, internal status, reconciliation and purchase date.
- Saved-filter style work queue for manual review.

### ADMIN-09 — Order Detail

- Summary, line items and attribution.
- Provider status versus internal status.
- Reconciliation state.
- Commission and cashback chain.
- Raw sync references.
- Timeline and cancel/refund/fraud information.
- Provider-controlled identifiers and financial amounts are read-only.

### ADMIN-10 — Commission Operations

- Summary by Estimated, Validated, Paid, Rejected, Reversed and Manual Review.
- Search/filter data table.
- Detail drawer showing provider amount, normalized amount, rate snapshot and source order.
- 85/15 calculation preview.
- Adjustment history.
- “Tạo adjustment” action requires reason and shows old/new/effective amount.

### ADMIN-11 — Cashback Operations

- Summary by Pending, Validated, Available, Rejected and Reversed.
- Search by user, order or reference.
- Detail showing commission source, user 85% amount and wallet transaction reference.
- Reversal timeline.
- No direct amount edit.

### ADMIN-12 — Wallet and Ledger Operations

- Search by user, reference and idempotency key.
- Wallet summary with available and reserved projection.
- Ledger-derived balance comparison.
- Warning state when projection mismatches ledger.
- Append-only transactions table.
- Only “Tạo adjustment” is available; never show “Sửa số dư”.

### ADMIN-13 — Withdrawals Queue

- Work queue prioritized by Pending and Processing.
- Columns: user, amount, masked bank, requested time, status, assigned admin and actions.
- Filters, bulk assignment only, no bulk complete.
- Pending count badge in sidebar.

### ADMIN-14 — Withdrawal Detail

- User identity.
- Integer VND amount.
- Masked approved bank snapshot.
- Wallet available/reserved snapshot at request time.
- Processing timeline.
- Actions:
  - “Chuyển sang đang xử lý”.
  - “Đánh dấu hoàn tất”.
  - “Từ chối”.
  - “Đánh dấu thất bại”.
- Complete requires transfer reference.
- Reject and Failed require reason.
- Confirmation previews wallet reserve/debit/release impact.

### ADMIN-15 — Reconciliation Batches

- Summary cards: Processing, Matched, Mismatch and Manual Review.
- Batch table fields: provider, period, source API/CSV/XLSX/manual, status, totals, matched, mismatched, created by and completion time.
- CTA: “Import báo cáo”.
- CTA: “Đồng bộ từ provider”.

### ADMIN-16 — Import Reconciliation Wizard

Create a five-step wizard:

1. Chọn nguồn/provider.
2. Upload CSV/XLSX.
3. Validate file and show errors.
4. Preview mapped records and date range.
5. Confirm import and show processing result.

Include drag/drop, file metadata, progress, duplicate-file warning and recoverable validation errors.

### ADMIN-17 — Reconciliation Batch Detail

- Batch metadata and progress.
- Counts for all result categories.
- Tabs:
  - Tất cả.
  - Matched.
  - Amount mismatch.
  - Status mismatch.
  - Missing internal.
  - Missing external.
  - Duplicated.
  - Manual review.
- Large record table with filters and row detail.
- 1024px collapsed-sidebar version.

### ADMIN-18 — Mismatch Comparison and Resolution

- Two-column comparison: `Dữ liệu hệ thống` versus `Dữ liệu provider`.
- Highlight only differing fields.
- Show order ID, statuses, order amount, commission and timestamps.
- Resolution actions:
  - Accept External.
  - Keep Internal.
  - Manual Adjustment.
  - Ignore.
- Mandatory reason field.
- Preview downstream commission/cashback/wallet effect.
- Actor and resolution timestamp.

### ADMIN-19 — Provider Sync

- Provider health cards.
- Last successful and failed synchronization.
- Latency and error counts.
- Sync history table with endpoint, external reference, received time, processing status and error.
- Collapsed raw JSON viewer in detail drawer.
- Manual retry confirmation with idempotency warning.

### ADMIN-20 — Manual Adjustments

- Read-only history table for commission/cashback/wallet adjustments.
- Old amount, adjustment amount, new effective amount, reason, related reconciliation item, actor and time.
- Create action available only from an eligible entity detail, not as an unscoped global form.

### ADMIN-21 — Audit Logs

- Immutable read-only table.
- Filters: actor, action, entity type, entity ID and date.
- Detail drawer with old/new diff, reason, IP and user agent where permitted.
- No edit or delete actions.

### ADMIN-22 — Provider Health and Configuration

- API and database health.
- Provider status and latest sync.
- Read-only display of current cashback split `User 85% / Platform 15%`.
- Read-only masked Affiliate ID.
- Configuration change area reserved for Super Admin with audit warning.
- Never expose credentials or JWT secrets.

---

## 9. Canonical status presentation

Render Vietnamese labels while retaining canonical codes in admin tooltips.

### Current statuses

```text
User: ACTIVE, DISABLED, DELETED
Bank: PENDING, APPROVED, REJECT
Affiliate Link: WORKING, EXPIRED, DELETED
```

### Future business statuses

```text
Conversion:
PENDING, VALIDATED, PARTIALLY_VALIDATED, REJECTED, MANUAL_REVIEW

Commission:
ESTIMATED, VALIDATED, PAID, REJECTED, REVERSED, MANUAL_REVIEW

Cashback:
PENDING, VALIDATED, AVAILABLE, REJECTED, REVERSED

Withdrawal:
PENDING, PROCESSING, COMPLETED, REJECTED, FAILED

Reconciliation:
MATCHED, MISMATCHED, MISSING_INTERNAL, MISSING_EXTERNAL,
AMOUNT_MISMATCH, STATUS_MISMATCH, DUPLICATED, MANUAL_REVIEW
```

Status meaning and colors:

- Success/Available/Paid/Completed: green.
- Pending/Estimated/Processing: amber.
- Validated/Informational: blue.
- Rejected/Failed/Reversed/Deleted: red.
- Manual Review/Mismatch: purple.
- Expired/Disabled/Neutral: gray.

Always pair color with icon and visible text.

---

## 10. Data and formatting rules

- VND format: `134.300 ₫`, never `134300.00`.
- Percentage: `10,5%`, maximum two meaningful decimals.
- User date/time: `08:20, 27/08/2026`.
- Admin can reveal ISO/UTC in tooltip where useful.
- Long IDs use monospace, middle truncation and copy action.
- URLs show hostname plus truncated path; full URL appears in tooltip or detail.
- Empty values display `—`, never `null` or `undefined`.
- Bank account numbers are masked except the final four digits.
- Do not call platform commission “cashback của bạn”.
- Estimated values have a nearby disclaimer.
- Product source and last update are visible in product detail.

---

## 11. Required states and edge cases

Every major data screen must include:

1. Populated state.
2. Loading skeleton.
3. Empty state with relevant CTA.
4. Error state with retry or next action.
5. No-results-after-filter state where applicable.

Explicitly design these edge cases in `05 — States and Dialogs`:

- Expired access session.
- Forbidden role.
- Invalid or non-Shopee URL.
- Unsafe/unexpected redirect.
- Product provider timeout.
- Product without image.
- Very long Vietnamese product name.
- Cashback reversed after previously becoming available.
- Withdrawal rejected with a long reason.
- Withdrawal failed after processing.
- Reconciliation batch processing a large file.
- Empty reconciliation batch.
- Destructive admin action confirmation.
- Financial adjustment reason dialog.
- Delete product blocked by existing affiliate links.

---

## 12. Responsive behavior

- User App is mobile-first and fully responsive.
- Generate desktop and 390px mobile versions for Login, Dashboard, Generate Link and Wallet.
- User tables become mobile cards.
- Sticky mobile bottom navigation respects safe areas.
- Admin is desktop-first.
- At 1024px, admin sidebar becomes a collapsible icon rail.
- Complex reconciliation tables may scroll horizontally with pinned identifiers and action columns.
- Dialogs become bottom sheets on user mobile where appropriate.
- Keep all touch targets at least 44×44px.

---

## 13. UX and safety rules

- Do not suggest cashback is instant or guaranteed.
- Do not merge estimated, validated and available balances.
- Do not invent click tracking.
- Do not create automatic payout or payment gateway flows.
- Do not create crypto wallets, point systems or multiple currencies.
- Do not create a product browsing marketplace or shopping cart.
- Do not allow editing Affiliate ID.
- Do not expose raw JWT tokens, secrets or password hashes.
- Do not provide direct balance editing.
- Do not provide audit-log or ledger deletion.
- Do not show full bank information in lists.
- Do not use color as the only state indicator.
- Do not fill dashboards with unsupported vanity metrics.

---

## 14. Backend-aware screen readiness

The design must include the complete future product, but keep component boundaries compatible with staged implementation.

### Available backend capabilities

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
POST /api/v1/auth/logout

POST /api/v1/generate-affiliate

GET/PATCH/DELETE /api/v1/affiliate and /api/v1/affiliate/:id
CRUD /api/v1/users
CRUD /api/v1/products
GET /api/v1/health
```

### Future backend capabilities represented in this design

```text
Orders
Commissions
Cashback
Wallet ledger
Bank account workflow
Withdrawals
Provider sync
Reconciliation
Manual adjustments
Audit logs
Aggregate dashboards
```

Do not visually label future screens as unfinished in the final polished design. Structure them so frontend developers can place them behind feature flags until APIs are available.

---

## 15. Final generation checklist

Before completing the one-shot render, verify that the project contains:

- One full design-system board.
- Login desktop and mobile.
- User Dashboard desktop and mobile.
- Generate Link desktop and mobile with input/loading/success/error states.
- My Links and Affiliate Link Detail.
- User Orders List and Order Detail.
- Cashback screen.
- Wallet desktop and mobile.
- Bank Accounts.
- Withdrawal Create, History and Detail.
- Profile.
- Admin Dashboard desktop and tablet.
- Admin Users List and User Detail.
- Admin Products List and Product Detail.
- Admin Affiliate Links List and Detail.
- Admin Orders List and Detail.
- Commission, Cashback and Wallet operations.
- Withdrawal Queue and Detail.
- Reconciliation Batch List, Import Wizard, Batch Detail and Mismatch Resolution.
- Provider Sync.
- Manual Adjustments.
- Audit Logs.
- Provider Health and Configuration.
- Shared loading, empty, error, permission and confirmation states.
- Consistent soft-pink/white visual system across every frame.
- Correct 85/15 cashback model.
- Clear distinction between Estimated, Validated and Available money.
- No click analytics, instant cashback or automatic payout UI.

Generate the complete project now from this document as one coherent UI system.
