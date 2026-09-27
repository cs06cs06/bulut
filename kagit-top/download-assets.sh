#!/usr/bin/env bash
# Kağıt Top — harici asset indirici
#
# Oyunun kullandığı tüm görsel, ses ve font dosyalarını orijinal
# kaynaklarından indirip assets/ klasörüne yerleştirir.
# Tüm kaynaklar ücretsiz lisanslıdır (CC0 / OFL), ayrıntılar: assets/CREDITS.md
#
# Kullanım:  ./download-assets.sh
# Gerekenler: curl, unzip

set -euo pipefail

cd "$(dirname "$0")"
ASSETS="assets"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$ASSETS/img" "$ASSETS/sfx" "$ASSETS/fonts"

fetch() { # fetch <url> <hedef>
  echo "  ↓ $2"
  curl -fsSL --retry 3 --retry-delay 2 -o "$2" "$1"
}

echo "Görseller (openclipart.org, CC0)…"
fetch "https://openclipart.org/image/400px/58831"  "$ASSETS/img/paper-ball.png" # Ball of Paper — Degri
fetch "https://openclipart.org/image/400px/178960" "$ASSETS/img/trash-bin.png"  # Papelera - Trash Bin — franklevel
fetch "https://openclipart.org/image/400px/217053" "$ASSETS/img/fan.png"        # Desk Fan Speed Designed — timtjtim

echo "Font (Google Fonts, SIL OFL 1.1)…"
fetch "https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/PatrickHand-Regular.ttf" "$ASSETS/fonts/PatrickHand-Regular.ttf"
fetch "https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/OFL.txt"                 "$ASSETS/fonts/OFL.txt"

echo "Sesler (kenney.nl, CC0)…"
KENNEY="https://kenney.nl/media/pages/assets"
fetch "$KENNEY/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip"       "$TMP/impact.zip"
fetch "$KENNEY/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip" "$TMP/interface.zip"
fetch "$KENNEY/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip"         "$TMP/casino.zip"

take() { # take <zip> <zip içindeki dosya> <hedef ad>
  unzip -p "$TMP/$1.zip" "Audio/$2" > "$ASSETS/sfx/$3"
  echo "  ✓ sfx/$3  ←  $1/$2"
}

take casino    cards-pack-open-1.ogg        crumple.ogg
take casino    card-slide-1.ogg             throw.ogg
take impact    impactMetal_light_000.ogg    rim1.ogg
take impact    impactMetal_light_001.ogg    rim2.ogg
take impact    impactMetal_light_002.ogg    rim3.ogg
take impact    impactSoft_medium_000.ogg    thud1.ogg
take impact    impactSoft_medium_001.ogg    thud2.ogg
take impact    impactGeneric_light_000.ogg  bin.ogg
take interface confirmation_001.ogg         score.ogg
take interface maximize_006.ogg             swish.ogg
take interface confirmation_002.ogg         levelup.ogg
take interface error_006.ogg                miss.ogg
take interface error_003.ogg                gameover.ogg
take interface click_001.ogg                click.ogg

unzip -p "$TMP/impact.zip" License.txt > "$ASSETS/sfx/LICENSE-kenney.txt"

echo "Tamam! Tüm assetler $ASSETS/ klasörüne indirildi."
