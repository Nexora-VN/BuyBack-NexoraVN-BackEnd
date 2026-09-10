# Production CI/CD — BuyBack

## Luồng đã cấu hình

Hai repo phát hành độc lập khi có push vào main (merge PR tạo push). Bật GitHub branch protection/ruleset **Require a pull request before merging**, chặn direct push/bypass nếu muốn chỉ merge PR mới phát hành.

1. Verify: frozen install, lint/typecheck/test/build. BE kiểm tra migrations và e2e trên PostgreSQL 18 tạm của CI, không dùng Azure.
2. Build Docker image trên GitHub; push GHCR với tag commit SHA; deploy bằng digest bất biến.
3. SSH deploy@4.213.53.132:22; flock chung /home/deploy/buyback/.deploy.lock cho cả hai repo.
4. BE: pull image → one-off container chạy pnpm prisma migrate deploy với backend/.env.prod → chỉ khi thành công mới thay backend.
5. FE: pull image → chỉ thay frontend. Không migrate hoặc restart backend.
6. Compose chờ healthy tối đa 180 giây. Lỗi bất kỳ dừng workflow; không tự rollback app/DB.

Giữ nguyên /home/deploy/buyback/docker-compose.yml, project buyback, network buyback-network, port 8082/3002, env_file và container tunnel. Script chỉ thêm override image tạm và lưu release metadata dưới .deploy-state.

Không chạy docker compose down, prune, git pull/reset hoặc thay file env trên VPS. App mới cần tương thích với app/DB cũ trong lúc rollout. Migrations phá hủy/rename/drop cần chia nhiều release; DBA phải có backup/PITR Azure trước release.

## Cấu hình GitHub một lần

Trong cả hai repo (hoặc Organization Actions Secrets, giới hạn đúng hai repo), thêm:

| Secret               | Nội dung                                               |
| -------------------- | ------------------------------------------------------ |
| PROD_SSH_PRIVATE_KEY | Private key SSH riêng cho CI, đăng nhập user deploy    |
| PROD_SSH_KNOWN_HOSTS | Dòng known_hosts đã xác minh cho 4.213.53.132, port 22 |

Không gửi secret vào chat, source hoặc issue. Không cần DATABASE_URL/ADDLIVETAG_API_KEY ở GitHub: migration/app dùng backend/.env.prod trên VPS. Không có bước duyệt thủ công theo lựa chọn hiện tại.

Workflow publish dùng GITHUB_TOKEN với packages:write, không cần registry write PAT. Cho phép GitHub Actions trong repo/org và quyền tạo package. GHCR tạo hai package:

- ghcr.io/nexora-vn/buyback-nexoravn-backend
- ghcr.io/nexora-vn/buyback-nexoravn-frontend

Nếu package đã tồn tại, cấp Actions access cho repo tương ứng.
Tài liệu: [GitHub — publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

## Chuẩn bị VPS một lần (operator tự thực hiện)

- User deploy phải dùng Docker không cần sudo; đây là quyền tương đương root, chỉ dùng deploy key chuyên dụng.
- Docker Engine + Compose v2 có up --wait, --wait-timeout, --pull và run --no-deps; kiểm tra docker compose version và docker compose up --help.
- Có bash, flock (gói util-linux), network buyback-network và stack hiện tại đang chạy.
- Cho phép SSH port 22 từ GitHub-hosted runners bằng cách phù hợp chính sách firewall của bạn. IP runner không cố định; nếu không mở được, cần runner trong mạng/VPN thay vì tắt kiểm tra SSH.
- Giữ file /home/deploy/buyback/backend/.env.prod, không copy vào image.

Tạo key trên máy quản trị (không phải trên GitHub runner):

```bash
ssh-keygen -t ed25519 -f ./buyback-ci -C buyback-github-actions
ssh-copy-id -i ./buyback-ci.pub deploy@4.213.53.132
```

Dùng key chuyên dụng không passphrase cho automation; private key đưa vào Secret rồi cất an toàn. Public key nằm trong authorized_keys của user deploy.

Lấy host key và **xác minh trước khi tin cậy**:

- Trên console VPS tin cậy: sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
- Trên máy quản trị: ssh-keyscan -t ed25519 4.213.53.132 > buyback-known-hosts
- Kiểm tra fingerprint: ssh-keygen -lf buyback-known-hosts
- Hai fingerprint phải khớp, sau đó đưa nội dung file vào PROD_SSH_KNOWN_HOSTS. Không tự tin cậy keyscan trong CI.

Đăng nhập GHCR một lần **dưới user deploy trên VPS**:

```bash
docker login ghcr.io -u TEN_TAI_KHOAN_GITHUB
```

Nhập PAT classic chỉ có read:packages tại prompt password, tài khoản có quyền đọc cả hai package (authorize org SSO nếu cần). Docker lưu credential trong home của deploy; cân nhắc credential helper. Không đặt PAT trong command line hoặc Compose.

## Phát hành

- Commit migration đã tạo cùng code BE. Pipeline không tự tạo migration từ schema.
- Merge PR main của repo cần phát hành.
- Xem Actions → Backend Production hoặc Frontend Production.
- Hai repo không có transaction deploy chung: với API thay đổi không tương thích, phát hành BE tương thích trước rồi FE.
- Không sửa trực tiếp script/Compose production bằng thao tác tự động ngoài những bước mô tả trên.

## Khi lỗi

- Verify/build/pull lỗi: chưa đổi app production.
- Migrate lỗi: container BE cũ vẫn giữ nguyên; **DB có thể đã áp dụng một phần các migration trước lỗi**. Không suy ra DB chưa thay đổi.
- Deploy/health lỗi: có thể container mới đã thay container cũ. Workflow dừng và báo đỏ; operator xem docker compose logs trên VPS (không public log chứa dữ liệu nhạy cảm).
- Xử lý nguyên nhân rồi rerun failed job trong Actions. Script bỏ qua workflow run cũ hơn lần deploy đã bắt đầu gần nhất.
- Không tự prisma migrate resolve, reset hay down DB. Migration failed cần kiểm tra trạng thái Prisma và sửa có chủ đích trước rerun.

State operator có thể đọc (không chứa secret):

- .deploy-state/backend.image / frontend.image: release thành công gần nhất.
- .deploy-state/backend.previous-image / frontend.previous-image: image ID trước lần deploy gần nhất.
- .deploy-state/backend.sha / frontend.sha: commit thành công.
- .deploy-state/backend.compose.json / frontend.compose.json: override image release.

Sau lần CI deploy đầu tiên, không chạy compose up với chỉ file gốc vì image latest local có thể cũ. Khi restart service dùng thêm override đã lưu:

```bash
cd /home/deploy/buyback
docker compose -p buyback -f docker-compose.yml -f .deploy-state/backend.compose.json up -d --no-deps --no-build backend
docker compose -p buyback -f docker-compose.yml -f .deploy-state/frontend.compose.json up -d --no-deps --no-build frontend
```

Rollback app chỉ làm thủ công sau khi xác nhận image cũ tương thích DB hiện tại. Giữ image cũ trên VPS; script không prune. Không rollback database theo image.

## Kiểm thử script không đụng VPS/DB

```bash
node --test scripts/deploy-production.check.mjs
bash -n scripts/deploy-production.sh
```

Tests giả lập docker/flock trong thư mục tạm: migration fail, thứ tự migrate→deploy, FE không migrate, health fail và stale run. Cần lần deploy thực tế sau khi cấu hình Secrets để xác nhận SSH/registry/firewall/Compose.
