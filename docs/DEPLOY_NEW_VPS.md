# BÁO CÁO & HƯỚNG DẪN BÀN GIAO: DI CHUYỂN CI/CD & DEPLOY SANG VPS MỚI

> **Ngày lập**: 30/09/2026  
> **Server đích**: `14.225.224.82` (User SSH: `theanh`, Port: `22`)  
> **Server cũ**: `4.213.53.132` (User SSH cũ: `deploy`)  
> **Mục tiêu**: Tạo ngăn độc lập cho dự án Nexora (Buyback) trên VPS mới, chuyển CI/CD GitHub Actions về đây, giới hạn tài nguyên an toàn và không làm ảnh hưởng các dự án đang chạy khác trên VPS.

---

## 1. Bối cảnh hạ tầng VPS mới (`14.225.224.82`)

Server này đang được chia sẻ (Multi-tenant) cho nhiều bên/dự án khác nhau:

1. **User `mhnam`**: Đang chạy Rootless Docker (đã chiếm cổng `3000`, `3005`, `7777`).
2. **Các Container LXD**: Server có ít nhất 3 container độc lập (UID `1000000`) chạy cổng SSH `2202, 2203, 2204` và cổng ứng dụng `8002-8004`, `9002-9004`.
3. **aaPanel Web Control Panel**: Đang chạy ở cổng **`40831`**.
4. **Hệ thống Nginx chung**: Đang giữ cổng `80` và `443` để tiếp nhận traffic bên ngoài.

**Nguyên tắc triển khai**:

- Không dùng tài khoản `root` cho CI/CD.
- Quy hoạch cổng riêng biệt: Frontend (`127.0.0.1:3002`), Backend (`127.0.0.1:3001`), Postgres chạy nội bộ trong mạng Docker `buyback-network`.
- Cách ly quyền truy cập tập tin: User `theanh` có thư mục `/home/theanh` được phân quyền `chmod 750`.
- **Giới hạn tài nguyên ngăn**: Khống chế CPU & RAM tối đa cho stack Nexora để không bao giờ nuốt cạn tài nguyên VPS làm chậm các dịch vụ khác.

---

## 2. Những việc ĐÃ HOÀN THÀNH

- [x] **Khảo sát port & tài nguyên**: Đã chạy `ss -tulpn`, xác nhận cổng `3001`, `3002`, `5432` còn trống hoàn toàn.
- [x] **Tạo User ngăn riêng trên VPS**: Đã tạo user `theanh`, khóa đăng nhập bằng mật khẩu, phân quyền `chmod 750 /home/theanh`, đã thêm vào nhóm `docker`.
- [x] **Cấu hình SSH Key**: Đã tạo thư mục `/home/theanh/.ssh/authorized_keys`, phân quyền `chmod 700 / 600`.
- [x] **Cập nhật GitHub Secrets**: Đã cập nhật 2 Secret quan trọng trên cả 2 Repository (`BuyBack-NexoraVN-BackEnd` và `BuyBack-NexoraVN-FrontEnd`):
  - `PROD_SSH_PRIVATE_KEY`: Khóa SSH riêng tư để runner kết nối vào user `theanh`.
  - `PROD_SSH_KNOWN_HOSTS`: Fingerprint SSH của server `14.225.224.82`.

---

## 3. Những việc CẦN LÀM TIẾP THEO (Handover Checklist)

### Giai đoạn 1: Chuẩn bị hạ tầng & Giới hạn tài nguyên trên VPS

Thực hiện trên terminal VPS `root@vps:~#`:

#### 1. Tạo symlink đường dẫn (để tương thích kịch bản deploy):

```bash
ln -s /home/theanh /home/deploy
```

#### 2. Cấu hình Giới hạn tài nguyên cấp Hệ điều hành (Systemd Cgroups):

VPS có tổng cộng **10 vCPU và 16GB RAM**. Ta giới hạn user `theanh` chỉ được dùng tối đa **4 vCPU Cores và 4GB RAM** (tránh trường hợp script hoặc app leak tài nguyên ảnh hưởng các ngăn khác):

```bash
# 400% = 4 Cores CPU, MemoryMax = 4GB RAM
systemctl set-property user-$(id -u theanh).slice CPUQuota=400% MemoryMax=4G

# Kiểm tra xác nhận:
systemctl show user-$(id -u theanh).slice | grep -E "CPUQuota|MemoryMax"
```

#### 3. Chuyển sang user `theanh` và tạo thư mục dự án:

```bash
su - theanh
mkdir -p /home/theanh/buyback/backend
cd /home/theanh/buyback
```

#### 4. Đăng nhập Docker vào GitHub Container Registry (GHCR):

_(Cần Personal Access Token của GitHub có quyền `read:packages` để server kéo được Docker image private)_

```bash
echo "<GITHUB_PAT_TOKEN>" | docker login ghcr.io -u <GITHUB_USERNAME> --password-stdin
```

#### 5. Tạo Docker network nội bộ:

```bash
docker network create buyback-network
```

#### 6. Tạo file `docker-compose.yml` tại `/home/theanh/buyback/docker-compose.yml`:

> **Lưu ý quan trọng**:
>
> - File đã được cấu hình **Healthcheck** bắt buộc để script `deploy-production.sh` không bị abort.
> - Đã thêm **Resource Limits** (CPU / RAM) trực tiếp cho từng container.

```bash
cat << 'EOF' > /home/theanh/buyback/docker-compose.yml
services:
  postgres:
    image: postgres:18-alpine
    container_name: buyback-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: buyback
      POSTGRES_USER: buyback
      POSTGRES_PASSWORD: buyback_secure_password
    volumes:
      - buyback-postgres-data:/var/lib/postgresql
    networks:
      - buyback-network
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1024M
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U buyback -d buyback']
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    image: ghcr.io/nexora-vn/buyback-nexoravn-backend:latest
    container_name: buyback-backend
    restart: unless-stopped
    env_file:
      - ./backend/.env.prod
    ports:
      - "127.0.0.1:3001:8080"
    networks:
      - buyback-network
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 1536M
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/health/live || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  frontend:
    image: ghcr.io/nexora-vn/buyback-nexoravn-frontend:latest
    container_name: buyback-frontend
    restart: unless-stopped
    ports:
      - "127.0.0.1:3002:3000"
    networks:
      - buyback-network
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 1536M
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/ || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

volumes:
  buyback-postgres-data:

networks:
  buyback-network:
    external: true
EOF
```

#### 7. Tạo file môi trường Backend tại `/home/theanh/buyback/backend/.env.prod`:

```bash
cat << 'EOF' > /home/theanh/buyback/backend/.env.prod
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://buyback:buyback_secure_password@buyback-postgres:5432/buyback?schema=aff
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars
JWT_ISSUER=buyback-api
JWT_AUDIENCE=buyback-client
CORS_ORIGINS=http://14.225.224.82:3002
LOG_LEVEL=info
EOF

chmod 600 /home/theanh/buyback/backend/.env.prod
```

#### 8. Khởi động DB Postgres:

```bash
docker compose -p buyback up -d postgres
```

---

### Giai đoạn 2: Cập nhật mã nguồn & Workflow trong Repository

1. **Repo `BuyBack-NexoraVN-BackEnd`**:
   - File `.github/workflows/ci.yml`:
     - Sửa dòng `deploy@4.213.53.132` thành `theanh@14.225.224.82`.
   - File `scripts/deploy-production.sh`:
     - Cập nhật dòng `deploy_dir=/home/deploy/buyback` (hoặc `/home/theanh/buyback`).
     - Nếu sửa đường dẫn này, cần sửa tương ứng trong `scripts/deploy-production.check.mjs` để test unit check luôn pass.

2. **Repo `BuyBack-NexoraVN-FrontEnd`**:
   - File `.github/workflows/production.yml`:
     - Sửa dòng `deploy@4.213.53.132` thành `theanh@14.225.224.82`.
     - Sửa `NEXT_PUBLIC_SITE_URL` từ `http://4.213.53.132:3002` thành `http://14.225.224.82:3002` (hoặc tên miền thật).
   - File `scripts/deploy-production.sh` và `scripts/deploy-production.check.mjs` (tương tự như backend).

---

### Giai đoạn 3: Cấu hình Reverse Proxy & SSL (Domain)

Vì Nginx hệ thống và aaPanel (cổng `40831`) đang quản lý cổng 80 & 443:

- Truy cập aaPanel: `http://14.225.224.82:40831`
- Vào **Website** > **Add Site**:
  - Tên miền website (ví dụ: `app.nexora.vn`) ➡️ Tạo Reverse Proxy trỏ đến `http://127.0.0.1:3002`.
  - Tên miền API (ví dụ: `api.nexora.vn`) ➡️ Tạo Reverse Proxy trỏ đến `http://127.0.0.1:3001`.
  - Bật chứng chỉ SSL Let's Encrypt trực tiếp trên aaPanel.

---

### Giai đoạn 4: Kích hoạt & Kiểm thử

1. Push code mới lên nhánh `main` ở Repo Backend trước:
   - GitHub Actions sẽ chạy Verify -> Build Docker Image -> SSH vào `theanh@14.225.224.82` -> Chạy Prisma migrate -> Khởi động `buyback-backend`.
2. Push code lên nhánh `main` ở Repo Frontend.
3. Kiểm tra trạng thái trên VPS bằng lệnh:
   ```bash
   su - theanh
   docker ps
   docker logs --tail 50 buyback-backend
   docker logs --tail 50 buyback-frontend
   ```
4. Kiểm tra sức khỏe hệ thống:
   - Backend: `curl http://127.0.0.1:3001/health/live` (kết quả trả về `{"status":"ok"}`).
   - Frontend: `curl -I http://127.0.0.1:3002`.
   - Kiểm tra các tiến trình của `mhnam` và các container khác để đảm bảo không bị ảnh hưởng.
