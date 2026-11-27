#!/usr/bin/env bash
# Демо Autoservice на Beget VPS — вставить целиком в консоль Beget (root).
# IP демо: http://IP_СЕРВЕРА/
set -euo pipefail

APP_DIR=/var/www/autoservice
BRANCH=cursor/post-schedule-month-board-633c
REPO=https://github.com/autougoriya-creator/autoservice.git

export DEBIAN_FRONTEND=noninteractive

echo "==> Система и пакеты"
apt-get update -y
apt-get install -y curl git nginx ca-certificates gnupg

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "==> Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Код ($BRANCH)"
mkdir -p /var/www
if [[ -d "$APP_DIR/.git" ]]; then
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "==> .env и зависимости"
if [[ ! -f .env ]]; then
  cp .env.example .env
fi
# SQLite-файл рядом с проектом
grep -q '^DATABASE_URL=' .env || echo 'DATABASE_URL="file:./dev.db"' >> .env
sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:./dev.db"|' .env

npm install
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run build

echo "==> PM2"
npm install -g pm2
pm2 delete autoservice 2>/dev/null || true
pm2 start npm --name autoservice -- start
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo "==> Nginx → :3000"
cat >/etc/nginx/sites-available/autoservice <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sfn /etc/nginx/sites-available/autoservice /etc/nginx/sites-enabled/autoservice
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

# Firewall (если ufw есть)
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw --force enable || true
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "Готово. Открой в браузере: http://${IP:-ВАШ_IP}/"
echo "Вход: /login → owner@demo.local / admin@demo.local / …"
echo "Проверка: pm2 status && curl -I http://127.0.0.1:3000"
