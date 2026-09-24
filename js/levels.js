/* Bölüm verileri.
 * Bloklar: { m: malzeme, s: şekil, x: merkez x, b: zeminden alt kenar yüksekliği }
 * Domuzlar: { t: tür, x, b }
 * Birim: dünya birimi (Kenney 70px = 42 birim). Zemin y = 0, yukarı negatif.
 */
(function (root) {
  // Yükseklikler (dünya birimi)
  var H70 = 42, H140 = 84, H220 = 132;

  var LEVELS = [
    {
      id: 1,
      name: 'Yeşil Çayır',
      theme: 'meadow',
      birds: ['red', 'red', 'red'],
      stars: [12000, 22000, 30000],
      right: 1080,
      blocks: [
        // Sol kulübe
        { m: 'wood', s: 'r70x140', x: 570, b: 0 },
        { m: 'wood', s: 'r70x140', x: 670, b: 0 },
        { m: 'wood', s: 'r220x70', x: 620, b: H140 },
        { m: 'glass', s: 's70', x: 590, b: H140 + H70 },
        { m: 'glass', s: 's70', x: 650, b: H140 + H70 },
        { m: 'wood', s: 'tri', x: 620, b: H140 + H70 * 2 },
        // Sağ kule
        { m: 'wood', s: 'r70x220', x: 850, b: 0 },
        { m: 'wood', s: 'r70x220', x: 950, b: 0 },
        { m: 'wood', s: 'r220x70', x: 900, b: H220 },
        { m: 'glass', s: 'r70x140', x: 866, b: H220 + H70 },
        { m: 'glass', s: 'r70x140', x: 934, b: H220 + H70 },
        { m: 'wood', s: 'r140x70', x: 900, b: H220 + H70 + H140 },
        { m: 'glass', s: 's70', x: 1010, b: 0 }
      ],
      pigs: [
        { t: 'small', x: 620, b: 0 },
        { t: 'medium', x: 900, b: 0 },
        { t: 'small', x: 900, b: H220 + H70 * 2 + H140 }
      ]
    },
    {
      id: 2,
      name: 'Gün Batımı Çölü',
      theme: 'desert',
      birds: ['red', 'yellow', 'blue', 'yellow'],
      stars: [20000, 35000, 46000],
      right: 1180,
      blocks: [
        // Sol taş kule (içinde TNT)
        { m: 'stone', s: 'r70x140', x: 676, b: 0 },
        { m: 'stone', s: 'r70x140', x: 764, b: 0 },
        { m: 'tnt', s: 's70', x: 720, b: 0 },
        { m: 'stone', s: 'r140x70', x: 720, b: H140 },
        { m: 'wood', s: 's70', x: 697, b: H140 + H70 },
        { m: 'wood', s: 's70', x: 743, b: H140 + H70 },
        { m: 'glass', s: 'r140x70', x: 720, b: H140 + H70 * 2 },
        // Ortadaki çukur
        { m: 'wood', s: 'r220x70', x: 875, b: 0 },
        // Sağ kale
        { m: 'stone', s: 'r70x220', x: 990, b: 0 },
        { m: 'stone', s: 'r70x220', x: 1090, b: 0 },
        { m: 'stone', s: 'r220x70', x: 1040, b: H220 },
        { m: 'wood', s: 'r70x140', x: 992, b: H220 + H70 },
        { m: 'wood', s: 'r70x140', x: 1088, b: H220 + H70 },
        { m: 'glass', s: 'r220x70', x: 1040, b: H220 + H70 + H140 },
        { m: 'stone', s: 'tri', x: 1040, b: H220 + H70 * 2 + H140 },
        { m: 'tnt', s: 's70', x: 1140, b: 0 }
      ],
      pigs: [
        { t: 'small', x: 720, b: H140 + H70 * 3 },
        { t: 'small', x: 875, b: H70 },
        { t: 'medium', x: 1040, b: 0 },
        { t: 'helmet', x: 1040, b: H220 + H70 }
      ]
    },
    {
      id: 3,
      name: 'Mantar Vadisi',
      theme: 'dusk',
      birds: ['red', 'blue', 'yellow', 'black', 'black'],
      stars: [30000, 45000, 58000],
      right: 1320,
      blocks: [
        // Karakol
        { m: 'glass', s: 'r70x140', x: 635, b: 0 },
        { m: 'glass', s: 'r70x140', x: 725, b: 0 },
        { m: 'tnt', s: 's70', x: 680, b: 0 },
        { m: 'wood', s: 'r140x70', x: 680, b: H140 },
        // Kale zemin katı
        { m: 'stone', s: 'r70x220', x: 940, b: 0 },
        { m: 'stone', s: 'r70x220', x: 1072, b: 0 },
        { m: 'stone', s: 'r70x220', x: 1204, b: 0 },
        { m: 'stone', s: 'r220x70', x: 1006, b: H220 },
        { m: 'stone', s: 'r220x70', x: 1138, b: H220 },
        // İkinci kat
        { m: 'wood', s: 'r70x140', x: 962, b: H220 + H70 },
        { m: 'wood', s: 'r70x140', x: 1050, b: H220 + H70 },
        { m: 'wood', s: 'r70x140', x: 1094, b: H220 + H70 },
        { m: 'wood', s: 'r70x140', x: 1182, b: H220 + H70 },
        { m: 'stone', s: 'r140x70', x: 1006, b: H220 + H70 + H140 },
        { m: 'wood', s: 'r140x70', x: 1138, b: H220 + H70 + H140 },
        // Taht katı
        { m: 'stone', s: 'r220x70', x: 1072, b: H220 + H70 * 2 + H140 },
        { m: 'glass', s: 's70', x: 1020, b: H220 + H70 * 3 + H140 },
        { m: 'glass', s: 's70', x: 1124, b: H220 + H70 * 3 + H140 },
        { m: 'tnt', s: 's70', x: 1262, b: 0 }
      ],
      pigs: [
        { t: 'small', x: 680, b: H140 + H70 },
        { t: 'medium', x: 1006, b: 0 },
        { t: 'medium', x: 1138, b: 0 },
        { t: 'helmet', x: 1006, b: H220 + H70 },
        { t: 'small', x: 1138, b: H220 + H70 },
        { t: 'king', x: 1072, b: H220 + H70 * 3 + H140 }
      ]
    }
  ];

  root.LEVELS = LEVELS;
  if (typeof module !== 'undefined') module.exports = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
