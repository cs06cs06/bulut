// Setlerin dünya içindeki yerleri ve kapı menteşeleri (three.js'ten bağımsız)
export const layout = {
  A: { origin: [0, 0, 0], name: 'İlkkan\'ın evi' },
  B: { origin: [40, 0, 0], name: 'Yılmaz\'ın evi' },
  C: { origin: [80, 0, 0], name: 'Apartman koridoru' },
  D: { origin: [120, 0, 0], name: 'Apartman girişi' },
  E: { origin: [160, 0, 0], name: 'Sokak' },
  F: { origin: [200, 0, 0], name: 'Şükrü\'nün bakkalı' },
  G: { origin: [240, 0, 0], name: 'Necmi Bey\'in evi' },
  // menteşe (yerel), kapalıyken kanadın yönü (derece), açılma yönü (+1/-1)
  doors: {
    A: { set: 'A', hinge: [-4.5, 0.1], closedYaw: 0, sign: 1 },
    B: { set: 'B', hinge: [-4.5, 0.1], closedYaw: 0, sign: 1 },
    C7: { set: 'C', hinge: [-2.5, -2.5], closedYaw: 90, sign: 1 },
    C8: { set: 'C', hinge: [2.7, -2.5], closedYaw: -90, sign: -1 },
  },
};
