export const BRANCH_LENSES = [
  { type: "bold", label: "更大胆", prefix: "放大冲突", note: "先不考虑限制，把最有辨识度的部分推到极致。" },
  { type: "lean", label: "更省成本", prefix: "零预算版本", note: "保留核心体验，删掉昂贵素材、设备和流程。" },
  { type: "feasible", label: "更易落地", prefix: "明天能做", note: "压缩为一天内能完成并验证的最小行动。" }
];

let sequence = 0;
export function uid(prefix = "node") {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function createNode({ id = uid(), title = "新想法", note = "", type = "idea", x = 0, y = 0, parentId = null, status = "open" } = {}) {
  return { id, title, note, type, x, y, parentId, status, createdAt: new Date().toISOString() };
}

export function createEdge(from, to, id = uid("edge")) {
  return { id, from, to };
}

export function branchNode(parent, existingNodes = []) {
  const batch = Math.floor(existingNodes.filter((node) => node.parentId === parent.id).length / BRANCH_LENSES.length);
  return BRANCH_LENSES.map((lens, index) => createNode({
    title: `${lens.prefix}：${parent.title}`,
    note: lens.note,
    type: lens.type,
    x: parent.x + 330,
    y: parent.y + (index - 1) * 170 + batch * 540,
    parentId: parent.id
  }));
}

export function descendantsOf(nodeId, nodes) {
  const found = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (node.parentId && found.has(node.parentId) && !found.has(node.id)) {
        found.add(node.id);
        changed = true;
      }
    });
  }
  return found;
}

export function lineageOf(nodeId, nodes) {
  const found = descendantsOf(nodeId, nodes);
  let current = nodes.find((node) => node.id === nodeId);
  while (current?.parentId) {
    found.add(current.parentId);
    current = nodes.find((node) => node.id === current.parentId);
  }
  return found;
}

export function computeStats(nodes, edges) {
  const roots = nodes.filter((node) => !node.parentId);
  const depths = new Map();
  const depthOf = (node) => {
    if (depths.has(node.id)) return depths.get(node.id);
    if (!node.parentId) { depths.set(node.id, 0); return 0; }
    const parent = nodes.find((item) => item.id === node.parentId);
    const depth = parent ? depthOf(parent) + 1 : 0;
    depths.set(node.id, depth);
    return depth;
  };
  const maxDepth = nodes.length ? Math.max(...nodes.map(depthOf)) : 0;
  const types = new Set(nodes.map((node) => node.type));
  const resolved = nodes.filter((node) => node.status === "chosen").length;
  const risks = nodes.filter((node) => node.type === "risk" && node.status !== "chosen").length;
  const divergence = Math.min(100, Math.round(((types.size - 1) * 16 + Math.max(0, nodes.length - roots.length) * 5)));
  const convergence = nodes.length ? Math.round((resolved / nodes.length) * 100) : 0;
  return { nodes: nodes.length, edges: edges.length, roots: roots.length, maxDepth, types: types.size, risks, divergence, convergence };
}

export function projectBounds(nodes, padding = 100) {
  if (!nodes.length) return { x: -padding, y: -padding, width: padding * 2, height: padding * 2 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + 260));
  const maxY = Math.max(...nodes.map((node) => node.y + 126));
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
}

export function serializeProject(project) {
  return JSON.stringify({ version: 1, title: project.title || "Forkflow Project", nodes: project.nodes, edges: project.edges }, null, 2);
}

export function parseProject(text) {
  const parsed = JSON.parse(text);
  if (parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) throw new Error("不支持的 Forkflow 项目格式");
  return parsed;
}
