import test from "node:test";
import assert from "node:assert/strict";
import { BRANCH_LENSES, branchNode, computeStats, createEdge, createNode, descendantsOf, lineageOf, parseProject, projectBounds, serializeProject } from "../src/core.js";

test("三向分叉使用明确的创意镜头", () => {
  assert.deepEqual(BRANCH_LENSES.map((lens) => lens.type), ["bold", "lean", "feasible"]);
  const parent = createNode({ id: "root", title: "城市短片", x: 10, y: 20 });
  const children = branchNode(parent);
  assert.equal(children.length, 3);
  assert.ok(children.every((node) => node.parentId === "root"));
  assert.deepEqual(children.map((node) => node.y), [-150, 20, 190]);
});

test("重复分叉自动进入下一条纵向轨道", () => {
  const parent = createNode({ id: "root", x: 0, y: 100 });
  const existing = [0, 1, 2].map((index) => createNode({ id: `old-${index}`, parentId: "root" }));
  assert.deepEqual(branchNode(parent, existing).map((node) => node.y), [470, 640, 810]);
});

test("后代集合包含所有层级", () => {
  const nodes = [createNode({ id: "a" }), createNode({ id: "b", parentId: "a" }), createNode({ id: "c", parentId: "b" }), createNode({ id: "x" })];
  assert.deepEqual([...descendantsOf("a", nodes)].sort(), ["a", "b", "c"]);
});

test("聚焦路径包含祖先和后代但排除旁支", () => {
  const nodes = [createNode({ id: "a" }), createNode({ id: "b", parentId: "a" }), createNode({ id: "c", parentId: "b" }), createNode({ id: "x", parentId: "a" })];
  assert.deepEqual([...lineageOf("b", nodes)].sort(), ["a", "b", "c"]);
});

test("探索仪表计算深度、类型和收敛率", () => {
  const nodes = [createNode({ id: "a", type: "seed" }), createNode({ id: "b", type: "bold", parentId: "a", status: "chosen" }), createNode({ id: "c", type: "risk", parentId: "b" })];
  const stats = computeStats(nodes, [createEdge("a", "b"), createEdge("b", "c")]);
  assert.equal(stats.maxDepth, 2);
  assert.equal(stats.types, 3);
  assert.equal(stats.convergence, 33);
  assert.equal(stats.risks, 1);
});

test("画布边界包含节点尺寸和留白", () => {
  const bounds = projectBounds([createNode({ x: 10, y: 20 }), createNode({ x: 400, y: 300 })], 50);
  assert.deepEqual(bounds, { x: -40, y: -30, width: 750, height: 506 });
});

test("项目可导出并安全导回", () => {
  const project = { title: "测试", nodes: [createNode({ id: "a" })], edges: [] };
  const parsed = parseProject(serializeProject(project));
  assert.equal(parsed.title, "测试");
  assert.equal(parsed.nodes[0].id, "a");
});

test("拒绝未知项目格式", () => {
  assert.throws(() => parseProject('{"version":2,"nodes":[],"edges":[]}'), /不支持/);
});
