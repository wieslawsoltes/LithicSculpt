import { Mesh } from './mesh.js';
import { subdivide, remesh } from './topology.js';
self.onmessage = e => { const { id, kind, vertices, indices, resolution } = e.data; try {
    const mesh = new Mesh(vertices, indices, true);
    let result, transition = null;
    if (kind === 'subdivide') {
        const r = subdivide(mesh);
        result = r.mesh;
        transition = r.transition;
    }
    else
        result = remesh(mesh, resolution, progress => self.postMessage({ id, progress }));
    const message = { id, vertices: result.v, indices: result.indices, transition }, transfer = [result.v.buffer, result.indices.buffer];
    if (transition)
        transfer.push(transition.offsets.buffer, transition.ids.buffer, transition.weights.buffer);
    self.postMessage(message, transfer);
}
catch (error) {
    self.postMessage({ id, error: error.message });
} };
