# AddLiveTag items reconciliation

## Source contract

Use `GET /api/v1/conversions.php` with `type=items`, the configured account,
from/to dates and all pages. Monetary fields are integer VND, stored as BigInt
and serialized as strings. Never divide them by 100000. The response summary is
an account/range aggregate, not a user balance or a payment receipt.

The supplied six-item sample has four cancellations, two completed items,
4913 VND estimated commission and 1983 gross_commission. Sum row commissions
against estimated_total_commission; do not substitute gross_commission, multiply
commission by qty, or infer a paid amount from either aggregate. Cancelled rows
may retain nonzero qty/order_value. MCN fees remain a manual review case until
net/gross semantics are verified; do not guess a deduction.

The six-item regression fixture preserves financial and tracking fields from the
user sample; product names are shortened and images omitted.

## Order vs commission vs wallet

- `cancelled`: rejected; never payable even with `Chưa chốt` or `Chờ trả hoa hồng`.
- `completed` + `Chưa chốt` / `Chờ trả hoa hồng`: ESTIMATED, cashback PENDING.
- `completed` + `Không hợp lệ`: rejected commission.
- Unknown status: manual review, no automatic payment.
- Missing UTM (`----`): keep for admin review, never guess a user from affiliate,
  account, product or purchase time. The affiliate field names the provider
  account, not the app user.
- A valid UTM must match all five saved link components and `sub_id1` when present.
  The app-created cancelled test order is attributable only if that link exists
  in the database. It contributes 0 VND and no wallet credit.
- Attribution review can assign a pending conversion but cannot turn it into
  payable commission. The stored cashback percentage is preserved across syncs.

No paid provider label has been supplied. Therefore no paid label is enabled by
default. `ADDLIVETAG_PAID_COMMISSION_STATUSES` is an optional `|`-separated list
of exact labels, to be set only after verifying actual paid source data. Leave
it unset for the current samples. The known unpaid/rejected labels cannot be
overridden. Unit/E2E tests use `TEST_VERIFIED_PAID` solely as synthetic test data;
it is not a claimed AddLiveTag label.

Even a previously VALIDATED commission or a draft settlement must pass a fresh
source payment check on create/confirm. Wallet credit occurs only at confirmed
settlement, never at import. Existing paid entries are immutable; changes raise
review issues. Full cancellation reverses only when no other data issue exists.

## Applying to existing data

No schema migration or automatic ledger rewrite is required. After deployment,
use the existing admin sync action for the desired dates/account. Interpretation
hash versioning reprocesses old unpaid snapshots instead of skipping them as
unchanged. Superseded open issues are resolved and current issues regenerated.
Existing paid records are not automatically rewritten into unpaid ones.

The provided six-item sample includes 2026-09-13, so a sync ending 2026-09-08
cannot include its first row. Use a range ending on or after 2026-09-13 to test
that cancellation. No live provider sync or financial data mutation is performed
by the code change itself.
