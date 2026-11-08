import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.APP_URL || "http://127.0.0.1:4175";
const executablePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const server = process.env.APP_URL ? null : spawn(process.execPath, ["server.js"], { stdio: "ignore" });

for (let attempt = 0; attempt < 40; attempt += 1) {
  try { if ((await fetch(baseURL)).ok) break; }
  catch { if (attempt === 39) throw new Error("本地测试服务器未能启动"); }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

await mkdir("assets", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  assert.equal(await page.locator(".node-card").count(), 7);
  assert.equal(await page.locator(".edge-path").count(), 6);
  assert.equal(await page.locator("#stat-depth").textContent(), "2");
  assert.equal(await page.locator(".node-card.selected").getAttribute("data-id"), "seed");

  await page.getByRole("button", { name: /分叉/ }).click();
  assert.equal(await page.locator(".node-card").count(), 10);
  assert.equal(await page.locator(".edge-path").count(), 9);
  assert.equal(await page.locator(".node-card[data-type='bold']").count(), 2);

  await page.locator(".node-card[data-id='lean']").click();
  await page.getByRole("button", { name: /聚焦/ }).click();
  assert.ok(await page.locator(".node-card.dimmed").count() > 0);
  await page.getByRole("button", { name: /聚焦/ }).click();

  await page.locator(".node-card[data-id='seed']").click();

  await page.locator("#node-title").fill("城市记忆：一扇玻璃的四季");
  assert.equal(await page.locator(".node-card.selected h3").textContent(), "城市记忆：一扇玻璃的四季");
  await page.locator("#node-status").selectOption("chosen");
  assert.ok(await page.locator(".node-card.selected").evaluate((node) => node.classList.contains("chosen")));

  const node = page.locator(".node-card[data-id='seed']");
  const box = await node.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 15); await page.mouse.down(); await page.mouse.move(box.x + 130, box.y + 55); await page.mouse.up();

  const jsonDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "JSON" }).click();
  assert.equal((await jsonDownload).suggestedFilename(), "forkflow-project.json");
  const pngDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "导出画布" }).click();
  assert.equal((await pngDownload).suggestedFilename(), "forkflow-canvas.png");

  await page.locator("#toast").evaluate((element) => element.classList.remove("show"));
  await page.screenshot({ path: "assets/preview.png", fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  mobile.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  mobile.on("pageerror", (error) => errors.push(error.message));
  await mobile.goto(baseURL, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear()); await mobile.reload({ waitUntil: "networkidle" });
  assert.equal(await mobile.locator(".node-card").count(), 7);
  await mobile.locator("#mobile-inspector").click();
  assert.ok(await mobile.locator("#inspector").evaluate((node) => node.classList.contains("open")));
  await mobile.locator("#inspector-close").click();
  assert.ok(await mobile.locator("#inspector").evaluate((node) => !node.classList.contains("open")));
  await mobile.waitForTimeout(300);
  assert.ok((await mobile.locator("body").evaluate((node) => node.scrollWidth)) <= 390, "移动端不应出现页面级横向溢出");
  await mobile.screenshot({ path: "assets/preview-mobile.png", fullPage: true });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ demoNodes: 7, branchingCreates: 3, focusMode: true, inspectorEditing: true, dragInteraction: true, jsonDownload: true, pngDownload: true, desktopViewport: "1440x1000", mobileViewport: "390x844", consoleErrors: 0 }, null, 2));
} finally {
  await browser.close(); server?.kill();
}
