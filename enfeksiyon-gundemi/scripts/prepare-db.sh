#!/usr/bin/env bash
# D1 veritabanını hazırlar (yoksa oluşturur), web/wrangler.toml dosyasını üretir
# ve şema güncellemelerini (migrations) uygular.
# Gerekli ortam değişkenleri: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
# İsteğe bağlı: ACCESS_TEAM_DOMAIN, ACCESS_AUD
set -euo pipefail
cd "$(dirname "$0")/../web"

DB_NAME="enfeksiyon-gundemi"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "::error::CLOUDFLARE_API_TOKEN veya CLOUDFLARE_ACCOUNT_ID GitHub Secrets'ta tanımlı değil."
  exit 1
fi

find_db() {
  npx wrangler d1 list --json | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const db = JSON.parse(s).find(d => d.name === process.argv[1]);
      process.stdout.write(db ? db.uuid : "");
    });' "$DB_NAME"
}

DB_ID="$(find_db)"
if [ -z "$DB_ID" ]; then
  echo "Veritabanı yok, oluşturuluyor (konum: Doğu Avrupa)…"
  npx wrangler d1 create "$DB_NAME" --location=eeur
  DB_ID="$(find_db)"
fi
if [ -z "$DB_ID" ]; then
  echo "::error::D1 veritabanı oluşturulamadı."
  exit 1
fi
echo "Veritabanı hazır."

# Yer tutucuları doldur. Boş bırakılan Access değerleri "kurulum modu" demektir.
sed -e "s|__D1_DATABASE_ID__|${DB_ID}|" \
    -e "s|__ACCESS_TEAM_DOMAIN__|${ACCESS_TEAM_DOMAIN:-__ACCESS_TEAM_DOMAIN__}|" \
    -e "s|__ACCESS_AUD__|${ACCESS_AUD:-__ACCESS_AUD__}|" \
    wrangler.template.toml > wrangler.toml

# Şema güncellemeleri. Günlük yazma kotası dolduysa güncelleme ertesi güne kalır; iş durmaz.
if ! out="$(npx wrangler d1 migrations apply "$DB_NAME" --remote 2>&1)"; then
  echo "$out"
  if echo "$out" | grep -qiE "row write limit|exceeded D1's free tier"; then
    echo "::warning::Veritabanı günlük yazma kotası dolu; şema güncellemesi bir sonraki çalıştırmaya kaldı."
  else
    echo "::error::Şema güncellemesi başarısız oldu."
    exit 1
  fi
else
  echo "$out"
fi
