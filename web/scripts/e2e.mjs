// End-to-end check: headless Chrome, driven over the DevTools protocol, uses
// the built web app against the local API with real uploads.
//
//   cd web && npm run build && npm run e2e
//
// Needs Node 22+, Chrome or Chromium (or CHROME=/path/to/chrome), and the API's
// venv (README, "API > Local setup"). The web build must point at
// http://localhost:8000, the default when NEXT_PUBLIC_API_URL is unset.
// Starts the API on :8000 and `next start` on :3100 itself, and stops them
// afterwards; refuses to run if either port is taken. Screenshots go to
// E2E_OUT, or a temp folder printed at the end.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API_DIR = join(ROOT, "api");
const WEB_DIR = join(ROOT, "web");
const PYTHON = join(API_DIR, ".venv/bin/python");
const FIX = join(API_DIR, "tests/fixtures");
const WORK = mkdtempSync(join(tmpdir(), "image-toolkit-e2e-"));
const OUT = process.env.E2E_OUT ?? join(WORK, "screens");
const IMAGES = join(WORK, "images");
const DOWNLOADS = join(WORK, "downloads");
const API_PORT = 8000;
const WEB_PORT = 3100;
const CDP_PORT = 9333;
const APP = `http://localhost:${WEB_PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const report = [];
function log(name, ok, detail) {
  report.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  — " + JSON.stringify(detail)}`);
}
function fail(message) {
  console.error(`e2e: ${message}`);
  process.exit(1);
}

// --- Preconditions -----------------------------------------------------------

const CHROME = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((path) => path && existsSync(path));
if (!CHROME) fail("no Chrome or Chromium found; set CHROME=/path/to/chrome");
if (!existsSync(PYTHON)) fail(`no API venv at ${PYTHON}; see README, "API > Local setup"`);
if (!existsSync(join(WEB_DIR, ".next/BUILD_ID"))) fail("no web build; run `npm run build` first");

const portFree = (port) =>
  new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });
for (const port of [API_PORT, WEB_PORT, CDP_PORT]) {
  if (!(await portFree(port))) fail(`port ${port} is in use; stop whatever is running there first`);
}

// --- Test images (made with the API's Pillow) -------------------------------

mkdirSync(OUT, { recursive: true });
execFileSync(PYTHON, [
  "-c",
  `
import shutil, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
out = Path(sys.argv[1])
for folder in ("batch/a", "batch/b", "many"):
    (out / folder).mkdir(parents=True)
portrait = Image.linear_gradient("L").resize((1200, 900)).convert("RGB").point(lambda v: 200 + v // 5)
draw = ImageDraw.Draw(portrait)
draw.ellipse((420, 220, 780, 580), fill=(180, 40, 50))
draw.rounded_rectangle((350, 560, 850, 900), 80, fill=(40, 70, 150))
portrait.filter(ImageFilter.GaussianBlur(1)).save(out / "portrait.jpg", quality=90)
Image.effect_noise((2000, 1500), 60).convert("RGB").save(out / "noise.jpg", quality=92)
shutil.copy(out / "portrait.jpg", out / "batch/a/pic.jpg")
shutil.copy(out / "noise.jpg", out / "batch/b/pic.jpg")
for i in range(1, 12):
    shutil.copy(out / "portrait.jpg", out / f"many/p{i}.jpg")
`,
  IMAGES,
]);
const image = (name) => join(IMAGES, name);

// Load the background-removal model before timing anything: a first run
// downloads it (176 MB), which would outlast the app's 60 s timeout.
console.log("Loading the u2net model (the first run downloads 176 MB)…");
execFileSync(PYTHON, ["-c", "from rembg import new_session; new_session('u2net')"], { cwd: API_DIR, stdio: "inherit" });

// --- Servers and browser -----------------------------------------------------

const children = [];
function start(command, args, options = {}) {
  const child = spawn(command, args, { ...options, detached: true, stdio: ["ignore", "ignore", "pipe"] });
  child.log = "";
  child.stderr.on("data", (chunk) => {
    child.log = (child.log + chunk).slice(-20_000);
  });
  children.push(child);
  return child;
}
function signalAll(signal) {
  for (const child of children) {
    try {
      process.kill(-child.pid, signal); // the whole group: next start forks
    } catch {
      // already gone
    }
  }
}
/** Stops the servers and Chrome and waits for them, so the ports are free for the next run. */
async function stopAll() {
  signalAll("SIGTERM");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && children.some((child) => child.exitCode === null && child.signalCode === null)) {
    await sleep(100);
  }
  signalAll("SIGKILL");
}
process.on("exit", () => signalAll("SIGKILL")); // last resort, e.g. after fail()
process.on("SIGINT", () => process.exit(130));

const api = start(join(API_DIR, ".venv/bin/uvicorn"), ["main:app", "--port", String(API_PORT)], {
  cwd: API_DIR,
  env: { ...process.env, ALLOWED_ORIGIN: APP },
});
start(join(WEB_DIR, "node_modules/.bin/next"), ["start", "-p", String(WEB_PORT)], { cwd: WEB_DIR });
start(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--disable-component-update",
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${join(WORK, "chrome")}`,
  "--window-size=1280,900",
  "about:blank",
]);

async function waitForHttp(url, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  fail(`${url} didn't come up`);
}
await waitForHttp(`http://localhost:${API_PORT}/health`);
await waitForHttp(APP);

let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    wsUrl = targets.find((target) => target.type === "page")?.webSocketDebuggerUrl;
  } catch {
    // Chrome still starting
  }
  if (!wsUrl) await sleep(100);
}
if (!wsUrl) fail("couldn't connect to Chrome");
const ws = new WebSocket(wsUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

// --- DevTools protocol helpers ----------------------------------------------

let nextId = 0;
const pending = new Map();
const pageErrors = [];
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id) {
    const call = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) call.reject(new Error(msg.error.message));
    else call.resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    pageErrors.push(msg.params.args.map((arg) => arg.value ?? arg.description).join(" "));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
async function js(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
  return result.result.value;
}
async function waitFor(expression, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await js(expression)) return true;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${expression.slice(0, 80)}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("DOM.enable");
await send("Network.enable");
try {
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS });
} catch {
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS });
}

const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, mobile: true };
// React has attached its handlers: files set before this would be ignored.
const HYDRATED = `(() => { const i = document.querySelector("input[type=file]"); return !!i && Object.keys(i).some((k) => k.startsWith("__reactProps")); })()`;

async function open(path, viewport = DESKTOP) {
  await send("Emulation.setDeviceMetricsOverride", viewport);
  await send("Emulation.setTouchEmulationEnabled", { enabled: viewport.mobile, maxTouchPoints: viewport.mobile ? 5 : 1 });
  await send("Page.navigate", { url: APP + path });
  await sleep(100);
  await waitFor(`document.readyState === "complete"`);
  await waitFor(HYDRATED);
}
/** Picks files through the page's first file input (the one Drop / Replace / the stage use). */
async function choose(paths) {
  const { root } = await send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
  await send("DOM.setFileInputFiles", { nodeId, files: Array.isArray(paths) ? paths : [paths] });
}
/** Clicks the first enabled button, or radio label, whose text is exactly `text`. */
const click = (text) =>
  js(`(() => { const el = [...document.querySelectorAll("button, label, a")].find((b) => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled); if (!el) return false; el.click(); return true; })()`);
/** Sets a React-controlled input the way typing does. */
const setInput = (selector, value) =>
  js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
const loaded = () => waitFor(`!!document.querySelector('img[alt="Working image"]') || /No preview of this format/.test(document.body.innerText)`);
const STATE = `(() => ({
  ring: document.querySelector("[role=progressbar]")?.textContent?.trim() ?? null,
  shimmer: !!document.querySelector(".shimmer"),
  result: document.querySelector("[data-result-line]")?.textContent?.trim() ?? null,
  alerts: [...document.querySelectorAll("[role=alert]")].map((a) => a.innerText.trim()).filter(Boolean),
  buttons: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()),
}))()`;
/** Waits for a run to finish, recording the stage states it passes through. */
async function outcome(timeout = 60_000) {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await js(STATE);
    const now = state.ring ?? (state.shimmer ? "Processing" : null);
    if (now && seen.at(-1) !== now) seen.push(now);
    if (state.result || state.alerts.length) {
      await sleep(250);
      const final = await js(STATE);
      return { ...final, filename: final.result?.split(" · ")[0] ?? null, seen, ms: Date.now() - started };
    }
    await sleep(20);
  }
  return { timedOut: true, seen, alerts: [], buttons: [] };
}
const ROWS = `[...document.querySelectorAll("li[data-status]")].map((li) => li.dataset.status)`;
/** Waits for a batch to finish, tracking how many images were ever running at once. */
async function batchOutcome(timeout = 90_000) {
  const started = Date.now();
  let mostRunning = 0;
  while (Date.now() - started < timeout) {
    const rows = await js(ROWS);
    mostRunning = Math.max(mostRunning, rows.filter((row) => row === "running").length);
    const busy = rows.some((row) => row === "running" || row === "queued");
    const working = await js(`[...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Working…")`);
    if (!busy && !working) return { rows, mostRunning, ms: Date.now() - started };
    await sleep(15);
  }
  return { timedOut: true, rows: await js(ROWS), mostRunning };
}
async function waitForFile(path, timeout = 15_000) {
  const started = Date.now();
  let lastSize = -1;
  while (Date.now() - started < timeout) {
    if (existsSync(path)) {
      const size = statSync(path).size;
      if (size > 0 && size === lastSize) return true;
      lastSize = size;
    }
    await sleep(200);
  }
  return false;
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
}
const network = (uploadBytesPerSecond, offline = false) =>
  send("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: uploadBytesPerSecond });
const alertsText = () => js(`[...document.querySelectorAll("[role=alert]")].map((a) => a.innerText).join(" | ")`);
const summary = (o) => ({
  seen: o.seen?.length > 4 ? [...o.seen.slice(0, 3), "…", ...o.seen.slice(-2)] : o.seen,
  result: o.result,
  ms: o.ms,
});
const SLIDER = `document.querySelector('[role=slider][aria-label="Before and after"]')`;

// --- Checks ------------------------------------------------------------------

try {
  // Landing, and a drop carried through "Which tool?" into the workspace
  await open("/");
  const links = await js(`[...document.querySelectorAll('nav[aria-label="Tools"] a')].map((a) => a.getAttribute("href"))`);
  log("landing lists the four tools", JSON.stringify(links) === JSON.stringify(["/remove-bg", "/resize", "/convert", "/watermark"]), links);
  await shot("landing");
  const missing = await fetch(`${APP}/blur`);
  log("an unknown tool is a 404", missing.status === 404, missing.status);
  await choose(image("portrait.jpg"));
  await waitFor(`!!document.querySelector("[role=dialog]")`, 5000);
  await shot("chooser");
  await click("Resize to preset");
  await waitFor(`location.pathname === "/resize"`);
  await loaded();
  log("a landing drop asks which tool, then opens it with the image", true);
  await click("Convert");
  await waitFor(`location.pathname === "/convert"`);
  const kept = await js(`!!document.querySelector('img[alt="Working image"]')`);
  log("switching tools keeps the image", kept, kept);

  // Convert under a throttled upload: estimate, ring %, shimmer, result
  await open("/convert");
  await choose(image("noise.jpg"));
  await loaded();
  await waitFor(`/~\\d/.test(document.body.innerText)`, 10_000);
  log("convert shows the browser's size estimate", true);
  await network(400 * 1024);
  await click("Convert image");
  let o = await outcome();
  await network(-1);
  log(
    "convert: upload ring climbs, then processing shimmer, then the result",
    !!o.result && o.seen.filter((s) => /^Uploading \d+%$/.test(s)).length >= 3 && o.seen.includes("Processing"),
    summary(o),
  );
  log("convert: download named by the API", o.filename === "noise.jpg" || o.filename === "noise-compressed.jpg", o.filename);
  await shot("convert-desktop");

  // Slider: settles after the intro sweep, then drag and arrow keys
  await sleep(1000);
  const settled = Number(await js(`${SLIDER}.getAttribute("aria-valuenow")`));
  const box = await js(`(() => { const r = ${SLIDER}.parentElement.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const y = box.y + box.h / 3;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x + box.w * 0.3, y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + box.w * 0.6, y, button: "left", buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + box.w * 0.8, y, button: "left", buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + box.w * 0.8, y, button: "left", buttons: 0, clickCount: 1 });
  const dragged = Number(await js(`${SLIDER}.getAttribute("aria-valuenow")`));
  await js(`${SLIDER}.focus()`);
  for (let i = 0; i < 5; i++) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
  }
  const keyed = Number(await js(`${SLIDER}.getAttribute("aria-valuenow")`));
  log("slider sweeps in, then settles at 55%", settled === 55, settled);
  log("slider follows a drag", Math.abs(dragged - 80) <= 2, dragged);
  log("slider moves 2% per arrow key", keyed === dragged - 10, keyed);

  // Resize: an API preset chip, a design-only chip, and the passport preset
  await open("/resize");
  await choose(image("portrait.jpg"));
  await loaded();
  const frame = await js(`!!document.querySelector("[data-frame]")`);
  await click("Resize image");
  o = await outcome();
  log("resize: frame on the stage, 1:1 Post comes back 1080×1080", frame && o.filename === "portrait-1080x1080.jpg", o.filename);
  await shot("resize-desktop");
  await click("4:5 Portrait");
  await click("Resize image");
  o = await outcome();
  const portrait = o.filename;
  await click("Passport 35×45 mm");
  await click("Resize image");
  o = await outcome();
  log(
    "resize: 4:5 is sent as a size, Passport as the API preset",
    portrait === "portrait-1080x1350.jpg" && o.filename === "portrait-413x531.jpg",
    { portrait, passport: o.filename },
  );

  // Watermark: live preview, asks for text, then stamps it
  await open("/watermark");
  await choose(image("portrait.jpg"));
  await loaded();
  const preview = await js(`!!document.querySelector("[data-watermark-preview]")`);
  await setInput('input[type=text][maxlength="100"]', "   ");
  await click("Apply watermark");
  await sleep(200);
  const formAlert = await alertsText();
  await setInput('input[type=text][maxlength="100"]', "© Studio Lagos");
  await click("Apply watermark");
  o = await outcome();
  log(
    "watermark: previews on the stage, asks for text, then stamps it",
    preview && formAlert.includes("Type the text for the watermark.") && o.filename === "portrait-watermarked.jpg",
    { preview, formAlert, filename: o.filename },
  );
  await shot("watermark-desktop");

  // Remove background, then a white background behind it
  await open("/remove-bg");
  await choose(image("portrait.jpg"));
  await loaded();
  await click("Remove background");
  o = await outcome();
  const transparent = o.result;
  await click("White");
  await waitFor(`!document.querySelector("[data-result-line]").textContent.includes(${JSON.stringify(transparent?.split(" · ")[1] ?? "")})`, 5000).catch(() => false);
  const white = await js(`document.querySelector("[data-result-line]")?.textContent`);
  log("remove-bg: PNG cut-out, then white behind it", o.filename === "portrait-nobg.png" && white !== transparent, { transparent, white });
  await shot("remove-bg-desktop");

  // HEIC in Chrome: no preview of the original, result still works
  await open("/convert");
  await choose(join(FIX, "photo.heic"));
  await sleep(600);
  const heicFallback = await js(`document.body.innerText.includes("No preview of this format")`);
  await click("Convert image");
  o = await outcome();
  log("HEIC: preview fallback, then a JPG result", heicFallback && o.filename === "photo.jpg", { heicFallback, filename: o.filename });

  // A damaged image: the API's message, no retry
  await open("/convert");
  await choose(join(FIX, "truncated.jpg"));
  await sleep(300);
  await click("Convert image");
  o = await outcome();
  log("damaged image: API message, no Try again", o.alerts.some((a) => a.includes("couldn't be read")) && !o.buttons.includes("Try again"), o.alerts);

  // Offline: retryable, and Try again works once back online
  await open("/convert");
  await choose(image("portrait.jpg"));
  await loaded();
  await network(-1, true);
  await click("Convert image");
  o = await outcome(15_000);
  await network(-1, false);
  const offline = o.alerts.some((a) => a.includes("Couldn’t reach the image service")) && o.buttons.includes("Try again");
  await click("Try again");
  const retried = await outcome();
  log("offline: says so, and Try again works", offline && !!retried.result, { alerts: o.alerts, retried: retried.result });

  // Wrong type is refused before upload
  await open("/convert");
  await choose(join(FIX, "not-an-image.txt"));
  await sleep(300);
  const refused = await alertsText();
  log("a text file is refused in the browser", refused.includes("not-an-image.txt isn’t a JPG, PNG, WEBP or HEIC image."), refused);

  // Batch on /resize: two files with the same name plus a damaged one
  await open("/resize");
  await choose([image("batch/a/pic.jpg"), image("batch/b/pic.jpg"), join(FIX, "truncated.jpg")]);
  await sleep(300);
  const ready = await js(ROWS);
  log("batch: three images queued", JSON.stringify(ready) === '["queued","queued","queued"]', ready);
  await click("Resize 3 images");
  let b = await batchOutcome();
  log("batch: strictly one image at a time", b.mostRunning === 1, b.mostRunning);
  const batchAlert = await alertsText();
  log(
    "batch: 2 done, the damaged one fails with the API's message",
    JSON.stringify(b.rows) === '["done","done","error"]' && batchAlert.includes("couldn't be read") && !batchAlert.includes("Try again"),
    { rows: b.rows, batchAlert },
  );
  await shot("batch-resize-desktop");
  await click("Download all (.zip)");
  const zipPath = join(DOWNLOADS, "resized-images.zip");
  const zipped = await waitForFile(zipPath);
  // Each entry's name, format and pixel size, read with Pillow.
  const entries = zipped
    ? JSON.parse(
        execFileSync(PYTHON, [
          "-c",
          `import io, json, sys, zipfile
from PIL import Image
z = zipfile.ZipFile(sys.argv[1])
print(json.dumps([[n, "%s %dx%d" % ((im := Image.open(io.BytesIO(z.read(n)))).format, *im.size)] for n in sorted(z.namelist())]))`,
          zipPath,
        ]).toString(),
      )
    : [];
  log(
    "batch: Download all saves a ZIP of both results, names made unique",
    JSON.stringify(entries) === JSON.stringify([["pic-1080x1080 (2).jpg", "JPEG 1080x1080"], ["pic-1080x1080.jpg", "JPEG 1080x1080"]]),
    entries,
  );

  // Batch offline, then Try again
  await open("/convert");
  await choose([image("batch/a/pic.jpg"), image("portrait.jpg")]);
  await sleep(300);
  await network(-1, true);
  await click("Convert 2 images");
  b = await batchOutcome(20_000);
  await network(-1, false);
  const offlineRows = b.rows;
  const retryClicked = await click("Try again");
  b = await batchOutcome();
  log(
    "batch offline: both fail, Try again finishes them",
    JSON.stringify(offlineRows) === '["error","error"]' && retryClicked && b.rows.every((row) => row === "done"),
    { offlineRows, after: b.rows },
  );

  // Cancel part-way through a slow batch
  await open("/convert");
  await choose([image("noise.jpg"), image("batch/b/pic.jpg"), image("portrait.jpg")]);
  await sleep(300);
  await network(200 * 1024);
  await click("Convert 3 images");
  await waitFor(`document.querySelector("li[data-status]")?.dataset.status === "running"`, 5000);
  await sleep(500);
  await click("Cancel");
  b = await batchOutcome(10_000);
  await network(-1);
  log("batch: Cancel skips the rest", b.rows.every((row) => row === "skipped"), b.rows);

  // More than 10
  await open("/resize");
  await choose(Array.from({ length: 11 }, (_, i) => image(`many/p${i + 1}.jpg`)));
  await sleep(300);
  const many = await js(ROWS);
  const tooMany = await alertsText();
  log("batch: at most 10, and the 11th is explained", many.length === 10 && tooMany.includes("p11.jpg wasn’t added: up to 10 images at a time."), { rows: many.length, tooMany });

  // Phone: 375 px with touch
  await open("/", PHONE);
  const landing = await js(`(() => { const cards = [...document.querySelectorAll('nav[aria-label="Tools"] li')].map((li) => li.getBoundingClientRect().left); return { columns: new Set(cards.map(Math.round)).size, width: document.documentElement.scrollWidth, choose: [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Choose a photo" && b.offsetParent) }; })()`);
  log("phone: landing is a 2×2 grid with Choose a photo, no sideways scroll", landing.columns === 2 && landing.choose && landing.width <= 375, landing);
  await shot("landing-phone");
  await open("/remove-bg", PHONE);
  await choose(image("portrait.jpg"));
  await loaded();
  await click("Remove background");
  o = await outcome();
  await sleep(1000);
  const phone = await js(`(() => {
    const img = document.querySelector('img[alt="Working image"]').getBoundingClientRect();
    const sheet = document.querySelector(".ws-panel").getBoundingClientRect();
    return { visible: Math.round(Math.min(img.bottom, sheet.top, innerHeight) - Math.max(img.top, 0)), width: document.documentElement.scrollWidth };
  })()`);
  log("phone: the image stays visible above the control sheet", !!o.result && phone.visible >= 150 && phone.width <= 375, phone);
  await shot("remove-bg-phone");

  log("no errors in the page console", pageErrors.length === 0, pageErrors.slice(0, 5));
  log("no tracebacks in the API log", !api.log.includes("Traceback"), api.log.includes("Traceback") ? api.log.slice(-2000) : undefined);
} catch (error) {
  log("script ran to the end", false, String(error));
} finally {
  ws.close();
  const failed = report.filter((r) => !r.ok).length;
  console.log(`\n${report.length - failed}/${report.length} passed. Screenshots: ${OUT}`);
  await stopAll();
  process.exit(failed ? 1 : 0);
}
