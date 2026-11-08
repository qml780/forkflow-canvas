import { branchNode, computeStats, createEdge, createNode, lineageOf, parseProject, projectBounds, serializeProject } from "./core.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  frame: $("#canvas-frame"), world: $("#world"), nodes: $("#nodes-layer"), connections: $("#connections"), minimap: $("#minimap"),
  projectTitle: $("#project-title"), divergence: $("#divergence-score"), statNodes: $("#stat-nodes"), statDepth: $("#stat-depth"), statTypes: $("#stat-types"), statConvergence: $("#stat-convergence"),
  selectionPanel: $("#selection-panel"), emptySelection: $("#empty-selection"), nodeTitle: $("#node-title"), nodeType: $("#node-type"), nodeStatus: $("#node-status"), nodeNote: $("#node-note"),
  branch: $("#branch-button"), focus: $("#focus-button"), demo: $("#demo-button"), duplicate: $("#duplicate-button"), delete: $("#delete-button"),
  zoomIn: $("#zoom-in"), zoomOut: $("#zoom-out"), zoomLabel: $("#zoom-label"), fit: $("#fit-button"), toast: $("#toast"),
  exportJson: $("#export-json"), exportPng: $("#export-png"), importButton: $("#import-button"), importFile: $("#import-file"),
  inspector: $("#inspector"), inspectorClose: $("#inspector-close"), mobileInspector: $("#mobile-inspector")
};

const typeLabels = { seed: "核心种子", idea: "普通想法", bold: "更大胆", lean: "更省成本", feasible: "易落地", reference: "参考", risk: "风险" };
let toastTimer;
let connectFrom = null;
let spacePressed = false;
let drag = null;
let state = { title: "城市记忆 / 创意探索", nodes: [], edges: [], selectedId: null, tool: "select", focus: false, zoom: 1, panX: 120, panY: 150 };

function demoProject() {
  const nodes = [
    createNode({ id: "seed", title: "一分钟短片：城市记忆", note: "用一个地点、一个声音和一个动作，让观众想起自己的城市。", type: "seed", x: 0, y: 120 }),
    createNode({ id: "bold", title: "让整座城市倒着播放", note: "人群、交通与影子逆行，只有主角向前。", type: "bold", x: 340, y: -60, parentId: "seed" }),
    createNode({ id: "lean", title: "只拍一扇便利店玻璃", note: "用反射完成城市层次，零场景调度。", type: "lean", x: 340, y: 120, parentId: "seed" }),
    createNode({ id: "feasible", title: "明天黄昏拍 8 个固定镜头", note: "同一条街、每镜 5 秒，以环境声串联。", type: "feasible", x: 340, y: 300, parentId: "seed" }),
    createNode({ id: "sound", title: "把红绿灯声做成节拍", note: "声音先行，画面跟随提示音切换。", type: "reference", x: 680, y: 55, parentId: "lean" }),
    createNode({ id: "risk", title: "风险：反射会暴露摄影者", note: "改用偏振镜或把人物纳入叙事。", type: "risk", x: 680, y: 215, parentId: "lean" }),
    createNode({ id: "pick", title: "最终方向：便利店玻璃 + 城市节拍", note: "一处机位完成视觉层次，用声音建立节奏。", type: "feasible", x: 680, y: 375, parentId: "feasible", status: "chosen" })
  ];
  const edges = [createEdge("seed", "bold", "e1"), createEdge("seed", "lean", "e2"), createEdge("seed", "feasible", "e3"), createEdge("lean", "sound", "e4"), createEdge("lean", "risk", "e5"), createEdge("feasible", "pick", "e6")];
  return { title: "城市记忆 / 创意探索", nodes, edges, selectedId: "seed", tool: "select", focus: false, zoom: 1, panX: 100, panY: 110 };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("forkflow-project"));
    if (saved?.nodes?.length) state = { ...state, ...saved };
    else state = demoProject();
  } catch { state = demoProject(); }
}

function saveState() {
  localStorage.setItem("forkflow-project", JSON.stringify({ title: state.title, nodes: state.nodes, edges: state.edges, selectedId: state.selectedId, zoom: state.zoom, panX: state.panX, panY: state.panY }));
}

function showToast(message) {
  clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function selectedNode() { return state.nodes.find((node) => node.id === state.selectedId) || null; }

function bezier(from, to) {
  const x1 = from.x + 260 + 5000; const y1 = from.y + 63 + 5000;
  const x2 = to.x + 5000; const y2 = to.y + 63 + 5000;
  const bend = Math.max(70, Math.abs(x2 - x1) * .45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function renderEdges() {
  const focused = state.focus && state.selectedId ? lineageOf(state.selectedId, state.nodes) : null;
  els.connections.innerHTML = state.edges.map((edge) => {
    const from = state.nodes.find((node) => node.id === edge.from); const to = state.nodes.find((node) => node.id === edge.to);
    if (!from || !to) return "";
    const active = focused?.has(from.id) && focused?.has(to.id) ? " active" : "";
    return `<path class="edge-path${active}" data-edge="${edge.id}" d="${bezier(from, to)}"/>`;
  }).join("");
}

function handleNodePointerDown(event, node) {
  if (event.button !== 0 || state.tool !== "select") return;
  event.stopPropagation();
  state.selectedId = node.id;
  drag = { type: "node", id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y };
  event.currentTarget.setPointerCapture(event.pointerId);
  render();
}

function handleNodeClick(event, node) {
  event.stopPropagation();
  if (state.tool === "connect") {
    if (!connectFrom) { connectFrom = node.id; state.selectedId = node.id; showToast("请选择要连接到的节点"); render(); return; }
    if (connectFrom !== node.id && !state.edges.some((edge) => edge.from === connectFrom && edge.to === node.id)) state.edges.push(createEdge(connectFrom, node.id));
    connectFrom = null; setTool("select"); saveState(); render(); showToast("已建立连接"); return;
  }
  state.selectedId = node.id; render();
}

function renderNodes() {
  const focused = state.focus && state.selectedId ? lineageOf(state.selectedId, state.nodes) : null;
  els.nodes.innerHTML = "";
  state.nodes.forEach((node, index) => {
    const card = document.createElement("article");
    card.className = `node-card ${state.selectedId === node.id ? "selected" : ""} ${focused && !focused.has(node.id) ? "dimmed" : ""} ${node.status}`;
    card.dataset.id = node.id; card.dataset.type = node.type;
    card.style.transform = `translate(${node.x}px, ${node.y}px)`;
    card.innerHTML = `<span class="node-port in"></span><div class="node-top"><span class="node-kind">${typeLabels[node.type] || node.type}</span><span class="node-number">${String(index + 1).padStart(2, "0")}</span></div><div class="node-content"><h3>${escapeHtml(node.title)}</h3><p>${escapeHtml(node.note || "双击右侧检查器添加备注")}</p></div><span class="node-port out"></span>`;
    card.addEventListener("pointerdown", (event) => handleNodePointerDown(event, node));
    card.addEventListener("click", (event) => handleNodeClick(event, node));
    els.nodes.append(card);
  });
}

function renderInspector() {
  const node = selectedNode();
  els.selectionPanel.hidden = !node; els.emptySelection.hidden = Boolean(node);
  if (node) {
    els.nodeTitle.value = node.title; els.nodeType.value = node.type; els.nodeStatus.value = node.status; els.nodeNote.value = node.note;
  }
  const stats = computeStats(state.nodes, state.edges);
  els.divergence.textContent = stats.divergence; els.statNodes.textContent = stats.nodes; els.statDepth.textContent = stats.maxDepth; els.statTypes.textContent = stats.types; els.statConvergence.textContent = `${stats.convergence}%`;
}

function renderMinimap() {
  const bounds = projectBounds(state.nodes, 30); const scale = Math.min(128 / bounds.width, 78 / bounds.height);
  els.minimap.innerHTML = state.nodes.map((node) => `<span class="mini-node ${node.id === state.selectedId ? "active" : ""}" style="left:${5 + (node.x - bounds.x) * scale}px;top:${5 + (node.y - bounds.y) * scale}px;width:${Math.max(5,260 * scale)}px;height:${Math.max(4,126 * scale)}px"></span>`).join("");
}

function renderTransform() {
  els.world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function render() {
  renderTransform(); renderEdges(); renderNodes(); renderInspector(); renderMinimap();
  els.projectTitle.value = state.title;
  document.querySelectorAll(".tool[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === state.tool));
  els.focus.classList.toggle("active", state.focus);
}

function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]); }

function setTool(tool) { state.tool = tool; connectFrom = null; render(); }

function addNodeAt(clientX, clientY) {
  const rect = els.frame.getBoundingClientRect();
  const x = (clientX - rect.left - state.panX) / state.zoom - 130;
  const y = (clientY - rect.top - state.panY) / state.zoom - 63;
  const node = createNode({ title: "新的创意碎片", note: "写下它为什么值得继续。", x, y });
  state.nodes.push(node); state.selectedId = node.id; setTool("select"); saveState(); render(); showToast("已添加想法节点");
}

function branchSelected() {
  const parent = selectedNode(); if (!parent) { showToast("请先选择一个节点"); return; }
  const children = branchNode(parent, state.nodes); state.nodes.push(...children); children.forEach((node) => state.edges.push(createEdge(parent.id, node.id)));
  saveState(); render(); showToast("已生成三条创意分叉");
}

function duplicateSelected() {
  const node = selectedNode(); if (!node) return;
  const clone = createNode({ ...node, id: undefined, title: `${node.title} / 副本`, x: node.x + 40, y: node.y + 150, parentId: node.parentId });
  state.nodes.push(clone); state.selectedId = clone.id; saveState(); render();
}

function deleteSelected() {
  if (!state.selectedId) return;
  const id = state.selectedId; state.nodes = state.nodes.filter((node) => node.id !== id); state.edges = state.edges.filter((edge) => edge.from !== id && edge.to !== id);
  state.nodes.forEach((node) => { if (node.parentId === id) node.parentId = null; }); state.selectedId = null; saveState(); render(); showToast("节点已删除");
}

function fitCanvas() {
  const bounds = projectBounds(state.nodes, 80); const rect = els.frame.getBoundingClientRect();
  state.zoom = Math.max(.35, Math.min(1.25, Math.min(rect.width / bounds.width, rect.height / bounds.height)));
  state.panX = (rect.width - bounds.width * state.zoom) / 2 - bounds.x * state.zoom;
  state.panY = (rect.height - bounds.height * state.zoom) / 2 - bounds.y * state.zoom; render(); saveState();
}

function download(content, type, filename) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename }); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function exportPng() {
  const bounds = projectBounds(state.nodes, 70); const width = Math.ceil(bounds.width); const height = Math.ceil(bounds.height);
  const esc = (value) => escapeHtml(value);
  const paths = state.edges.map((edge) => { const from = state.nodes.find((n) => n.id === edge.from); const to = state.nodes.find((n) => n.id === edge.to); if (!from || !to) return ""; const shiftedFrom = { ...from, x: from.x - bounds.x, y: from.y - bounds.y }; const shiftedTo = { ...to, x: to.x - bounds.x, y: to.y - bounds.y }; const x1 = shiftedFrom.x + 260, y1 = shiftedFrom.y + 63, x2 = shiftedTo.x, y2 = shiftedTo.y + 63, bend = Math.max(70, Math.abs(x2-x1)*.45); return `<path d="M${x1} ${y1} C${x1+bend} ${y1} ${x2-bend} ${y2} ${x2} ${y2}" fill="none" stroke="#8f9088" stroke-width="2"/>`; }).join("");
  const cards = state.nodes.map((node, index) => { const x = node.x - bounds.x, y = node.y - bounds.y; return `<g transform="translate(${x} ${y})"><rect width="260" height="126" rx="10" fill="#fbfaf4" stroke="#111110" stroke-width="2"/><rect width="260" height="30" rx="10" fill="#f3f1e8"/><text x="12" y="20" font-family="monospace" font-size="9" fill="#555">${esc(typeLabels[node.type] || node.type).toUpperCase()}</text><text x="242" y="20" text-anchor="end" font-family="monospace" font-size="9" fill="#777">${String(index+1).padStart(2,"0")}</text><text x="14" y="57" font-family="sans-serif" font-weight="700" font-size="14" fill="#111">${esc(node.title.slice(0,28))}</text><text x="14" y="82" font-family="sans-serif" font-size="10" fill="#777">${esc((node.note || "").slice(0,42))}</text></g>`; }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e9e7dd"/><defs><pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#c4c2b9"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>${paths}${cards}<text x="30" y="${height-25}" font-family="monospace" font-size="10" fill="#777">FORKFLOW CANVAS · ${esc(state.title)}</text></svg>`;
  const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = width * 2; canvas.height = height * 2; const ctx = canvas.getContext("2d"); ctx.scale(2,2); ctx.drawImage(image,0,0);
  canvas.toBlob((blob) => blob && download(blob, "image/png", "forkflow-canvas.png"), "image/png");
}

document.querySelectorAll(".tool[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
els.branch.addEventListener("click", branchSelected); els.focus.addEventListener("click", () => { if (!state.selectedId) return showToast("请先选择一个节点"); state.focus = !state.focus; render(); });
els.demo.addEventListener("click", () => { state = demoProject(); saveState(); render(); setTimeout(fitCanvas, 0); showToast("演示画布已重置"); });
els.duplicate.addEventListener("click", duplicateSelected); els.delete.addEventListener("click", deleteSelected);
els.zoomIn.addEventListener("click", () => { state.zoom = Math.min(2, state.zoom + .1); render(); saveState(); }); els.zoomOut.addEventListener("click", () => { state.zoom = Math.max(.3, state.zoom - .1); render(); saveState(); }); els.zoomLabel.addEventListener("click", fitCanvas); els.fit.addEventListener("click", fitCanvas);
els.projectTitle.addEventListener("input", () => { state.title = els.projectTitle.value; saveState(); });
[[els.nodeTitle,"title"],[els.nodeType,"type"],[els.nodeStatus,"status"],[els.nodeNote,"note"]].forEach(([element,key]) => element.addEventListener("input", () => { const node = selectedNode(); if (!node) return; node[key] = element.value; saveState(); renderNodes(); renderInspector(); renderMinimap(); }));
els.exportJson.addEventListener("click", () => download(serializeProject(state), "application/json;charset=utf-8", "forkflow-project.json")); els.exportPng.addEventListener("click", exportPng);
els.importButton.addEventListener("click", () => els.importFile.click()); els.importFile.addEventListener("change", async () => { try { const project = parseProject(await els.importFile.files[0].text()); state = { ...state, ...project, selectedId: project.nodes[0]?.id || null }; saveState(); render(); fitCanvas(); showToast("项目已导入"); } catch (error) { showToast(error.message); } });
els.mobileInspector.addEventListener("click", () => els.inspector.classList.add("open")); els.inspectorClose.addEventListener("click", () => els.inspector.classList.remove("open"));

els.frame.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".node-card") || event.target.closest(".zoom-controls")) return;
  if (state.tool === "add") { addNodeAt(event.clientX, event.clientY); return; }
  drag = { type: "pan", startX: event.clientX, startY: event.clientY, panX: state.panX, panY: state.panY }; els.frame.classList.add("grabbing"); els.frame.setPointerCapture(event.pointerId);
  if (!spacePressed && state.tool === "select") { state.selectedId = null; render(); }
});
window.addEventListener("pointermove", (event) => {
  if (!drag) return;
  if (drag.type === "pan") { state.panX = drag.panX + event.clientX - drag.startX; state.panY = drag.panY + event.clientY - drag.startY; renderTransform(); }
  if (drag.type === "node") { const node = state.nodes.find((item) => item.id === drag.id); if (!node) return; node.x = drag.x + (event.clientX - drag.startX) / state.zoom; node.y = drag.y + (event.clientY - drag.startY) / state.zoom; renderEdges(); renderNodes(); renderMinimap(); }
});
window.addEventListener("pointerup", () => { if (drag) saveState(); drag = null; els.frame.classList.remove("grabbing"); });
els.frame.addEventListener("wheel", (event) => { event.preventDefault(); const rect = els.frame.getBoundingClientRect(); const old = state.zoom; const next = Math.max(.3, Math.min(2, old * (event.deltaY > 0 ? .9 : 1.1))); const x = event.clientX - rect.left, y = event.clientY - rect.top; state.panX = x - (x - state.panX) * (next / old); state.panY = y - (y - state.panY) * (next / old); state.zoom = next; renderTransform(); saveState(); }, { passive: false });
window.addEventListener("keydown", (event) => {
  if (["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.code === "Space") spacePressed = true;
  if (event.key.toLowerCase() === "v") setTool("select"); if (event.key.toLowerCase() === "n") setTool("add"); if (event.key.toLowerCase() === "c") setTool("connect");
  if (event.key.toLowerCase() === "b") branchSelected(); if (event.key.toLowerCase() === "f") els.focus.click(); if (event.key === "0") fitCanvas();
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedId) deleteSelected();
});
window.addEventListener("keyup", (event) => { if (event.code === "Space") spacePressed = false; });

loadState(); render(); requestAnimationFrame(fitCanvas);
