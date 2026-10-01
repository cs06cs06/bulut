// Ağır yüzey üretimini ana iş parçacığından ayırır (yükleme sırasında arayüz akıcı kalır).
// Yüksek çözünürlüklü heykel meshoptimizer ile hedef üçgen sayısına sadeleştirilir.
import { mesh } from './sdf.js';
import { buildPart } from './shapes.js';
import { MeshoptSimplifier } from '../../vendor/meshoptimizer/meshopt_simplifier.module.js';

let simplify = null;
const ready = MeshoptSimplifier.ready.then(() => {
  simplify = (indices, positions, attr, target, err = 0.03) => {
    const [out] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attr, 4, [0.25, 0.25, 0.25, 2.5], null, target, err, []);
    return out;
  };
}).catch(() => { simplify = null; });

self.onmessage = async (e) => {
  const { id, job } = e.data;
  try {
    await ready;
    // sadeleştirici yoksa (ör. WebAssembly engelliyse) kaba ızgarayla üret
    const j = simplify ? job : { ...job, h: job.hc ?? job.h };
    const r = buildPart(j, mesh, simplify);
    self.postMessage({ id, r }, [r.positions.buffer, r.normals.buffer, r.indices.buffer, r.region.buffer, r.aux.buffer, r.tag.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
