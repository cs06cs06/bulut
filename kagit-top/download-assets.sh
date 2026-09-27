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
# Dunder Mifflin Scranton ofisinin eşyaları
fetch "https://openclipart.org/image/400px/26436"  "$ASSETS/img/monitor.png"        # Old CRT Monitor — Anonymous
fetch "https://openclipart.org/image/400px/19080"  "$ASSETS/img/stapler.png"        # Blue Stapler — jimmiet
fetch "https://openclipart.org/image/400px/170859" "$ASSETS/img/trophy.png"         # trophy — hatalar205
fetch "https://openclipart.org/image/400px/229792" "$ASSETS/img/beet.png"           # Beet (extra shadows) — doctormo
fetch "https://openclipart.org/image/400px/210485" "$ASSETS/img/water-cooler.png"   # Misc Water Cooler — glitch
fetch "https://openclipart.org/image/400px/229118" "$ASSETS/img/filing-cabinet.png" # Metallic Filing Cabinet — GDJ
fetch "https://openclipart.org/image/400px/264098" "$ASSETS/img/plant.png"          # potted plant - coloured — frankes

echo "Fontlar (Google Fonts, SIL OFL 1.1)…"
GFONTS="https://raw.githubusercontent.com/google/fonts/main/ofl"
fetch "$GFONTS/patrickhand/PatrickHand-Regular.ttf" "$ASSETS/fonts/PatrickHand-Regular.ttf"
fetch "$GFONTS/patrickhand/OFL.txt"                 "$ASSETS/fonts/OFL-PatrickHand.txt"
fetch "$GFONTS/bebasneue/BebasNeue-Regular.ttf"     "$ASSETS/fonts/BebasNeue-Regular.ttf"
fetch "$GFONTS/bebasneue/OFL.txt"                   "$ASSETS/fonts/OFL-BebasNeue.txt"

echo "Sesler (kenney.nl, CC0)…"
KENNEY="https://kenney.nl/media/pages/assets"
fetch "$KENNEY/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip"       "$TMP/impact.zip"
fetch "$KENNEY/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip" "$TMP/interface.zip"
fetch "$KENNEY/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip"         "$TMP/casino.zip"
fetch "$KENNEY/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip"               "$TMP/rpg.zip"

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
take interface confirmation_004.ogg         award.ogg
take impact    impactSoft_heavy_000.ogg     box.ogg
take rpg       handleCoins.ogg              coins.ogg

unzip -p "$TMP/impact.zip" License.txt > "$ASSETS/sfx/LICENSE-kenney.txt"

echo "Tamam! Tüm assetler $ASSETS/ klasörüne indirildi."
