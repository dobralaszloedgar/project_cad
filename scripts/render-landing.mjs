// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chromium } from "@playwright/test";
import { verifyMediaPlayback } from "./verify-landing-media.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = new URL(option("--url", "http://127.0.0.1:3000/"));
if (!["localhost", "127.0.0.1"].includes(source.hostname))
  throw new Error("Capture requires a local development server");
source.searchParams.set("render", "capture");
const out = path.resolve(option("--out", "public/landing-media"));
const evidence = path.resolve(
  option("--evidence", "/tmp/project-cad-landing-render"),
);
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
const ffmpeg =
  process.env.LANDING_FFMPEG ||
  spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout.trim();
const ffprobe =
  process.env.LANDING_FFPROBE ||
  spawnSync("which", ["ffprobe"], { encoding: "utf8" }).stdout.trim();
if (!ffmpeg || !ffprobe)
  throw new Error("Install ffmpeg and ffprobe before rendering");
// Native 120 FPS masters use HEVC. Chrome's hardware decoder failed on the
// high-resolution H.264 exports once the detailed 3D footage began. The public
// CPU-friendly derivatives below remain H.264 for broad browser support.
const nativeEncoding =
  process.platform === "darwin"
    ? [
        "-c:v",
        "hevc_videotoolbox",
        "-allow_sw",
        "0",
        "-profile:v",
        "main",
        "-q:v",
        "85",
      ]
    : [
        "-c:v",
        "libx265",
        "-preset",
        "fast",
        "-crf",
        "14",
        "-x265-params",
        "keyint=6:min-keyint=6:scenecut=0:bframes=0",
      ];
const nativeOutput = [
  ...nativeEncoding,
  "-g",
  "6",
  "-bf",
  "0",
  "-pix_fmt",
  "yuv420p",
  "-tag:v",
  "hvc1",
  "-movflags",
  "+faststart",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
];
const fps = 120,
  duration = 34.2,
  frames = Math.round(duration * fps);
const refreshDesign = args.includes("--refresh-design");
const refreshProcess = args.includes("--refresh-process");
if (refreshDesign && refreshProcess)
  throw new Error("Choose one refresh interval");
const refreshing = refreshDesign || refreshProcess;
const captureStart = refreshProcess ? 8 * fps : 0;
const captureEnd = refreshDesign ? 10 * fps : frames;
const captureFrames = captureEnd - captureStart;
function state(t) {
  if (t <= 8) return { p: 0, d: t / 8, c: 0, s: 0 };
  if (t <= 10) return { p: 0.18 + ((t - 8) / 2) * 0.18, d: 1, c: 0, s: 0 };
  if (t <= 20)
    return { p: 0.36 + ((t - 10) / 10) * 0.17, d: 1, c: (t - 10) / 10, s: 0 };
  if (t <= 21.2)
    return {
      p: 0.53 + ((t - 20) / 1.2) * 0.02,
      d: 1,
      c: 1,
      s: Math.min(1, Math.round(((t - 20) / 1.2) * 1e9) / 1e9),
    };
  if (t <= 25.2) return { p: 0.55 + ((t - 21.2) / 4) * 0.4, d: 1, c: 1, s: 1 };
  return { p: 0.95 + ((t - 25.2) / 9) * 0.7, d: 1, c: 1, s: 1 };
}
const probe = (file) => {
  const p = spawnSync(
    ffprobe,
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate,nb_read_frames,duration",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (p.status !== 0) throw new Error(p.stderr);
  return JSON.parse(p.stdout).streams[0];
};
const transcode = (params) =>
  new Promise((resolve, reject) => {
    const process = spawn(
      ffmpeg,
      ["-y", "-hide_banner", "-loglevel", "error", ...params],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let error = "";
    process.stderr.on("data", (text) => (error = (error + text).slice(-12000)));
    process.on("error", reject);
    process.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(error)),
    );
  });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-gpu"],
});
const ledgerFile = path.join(evidence, "render-ledger.json");
const ledger = fs.existsSync(ledgerFile)
  ? JSON.parse(fs.readFileSync(ledgerFile, "utf8"))
  : [];
const derivativeErrors = [];
const derivatives = [];
try {
  for (const config of [
    {
      name: "desktop",
      width: 1440,
      height: 900,
      dpr: 8 / 3,
      playbackWidth: 1920,
    },
    { name: "portrait", width: 390, height: 844, dpr: 4, playbackWidth: 1170 },
  ]) {
    if (
      option("--only", "all") !== "all" &&
      option("--only", "all") !== config.name
    )
      continue;
    const context = await browser.newContext({
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: config.dpr,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage(),
      cdp = await context.newCDPSession(page);
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (/43118|43119|api\.muse|api\.openai|anthropic/.test(r.url()))
        requests.push(r.url());
    });
    await page.goto(source.href, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForFunction(
      () => window.captureStory,
      {},
      { timeout: 120000 },
    );
    await page.waitForSelector('[data-live-cad][data-canvas-ready="true"]', {
      state: "attached",
      timeout: 60000,
    });
    await page.evaluate(() => {
      const root = document.querySelector("[data-landing-page]");
      scrollTo(0, ((root.offsetHeight - innerHeight) * 0.95) / 1.65);
      window.captureStory.set({ p: 0.95, d: 1, c: 1, s: 1 });
    });
    await page.waitForFunction(
      () => document.querySelector("canvas")?.dataset.ready === "true",
      {},
      { timeout: 120000 },
    );
    await page.addStyleTag({
      content:
        '[data-landing-stage]>header,[data-landing-stage]>footer,[aria-label="Scene navigation"],[class*="scrollProgress"],[class*="skipLink"],[class*="sceneCaption"],[class*="designCaption"]{visibility:hidden!important}*{transition:none!important}',
    });
    const gpu = await page
      .locator("canvas")
      .evaluate((c) => ({ width: c.width, height: c.height, ...c.dataset }));
    const width = Math.round(config.width * config.dpr),
      height = Math.round(config.height * config.dpr);
    if (
      gpu.graphicsSoftware !== "false" ||
      gpu.width !== width ||
      gpu.height !== height
    )
      throw new Error(
        "Capture must use the native GPU and native output pixels: " +
          JSON.stringify(gpu),
      );
    console.log(config.name + " native capture " + JSON.stringify(gpu));
    const offset = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const advance = async (t) =>
      page.evaluate(
        async ({ t, s }) => {
          window.captureStory.set(s);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          for (const animation of document.getAnimations())
            if (animation.constructor.name === "CSSAnimation") {
              animation.pause();
              animation.currentTime = t * 1000;
            }
        },
        { t, s: state(t) },
      );
    const capture = async () =>
      Buffer.from(
        (
          await cdp.send("Page.captureScreenshot", {
            format: "png",
            fromSurface: true,
            captureBeyondViewport: false,
            optimizeForSpeed: true,
            clip: {
              x: offset.x,
              y: offset.y,
              width: config.width,
              height: config.height,
              scale: config.dpr,
            },
          })
        ).data,
        "base64",
      );
    for (const [label, t] of [
      ["design", 7.3],
      ["build", 15],
      ["plant", 25],
      ["column", 34],
    ]) {
      await advance(t);
      if (label === "design") {
        const clip = await page
          .locator('[data-example-assistant] [class*="drawer"]')
          .evaluate((el) => getComputedStyle(el).clipPath);
        if (
          clip !== "none" &&
          !/^inset\(0px(?: 0px){0,3} round 20px\)$/.test(clip)
        )
          throw new Error("Chat contents are still clipped: " + clip);
        if (
          !(await page
            .getByRole("button", {
              name: "Apply reviewed actions",
              exact: true,
            })
            .count())
        )
          throw new Error("Missing real review action");
      }
      const png = await capture();
      if (png.length < 150000)
        throw new Error("Missing visible preflight content: " + label);
      fs.writeFileSync(
        path.join(evidence, `${config.name}-preflight-${label}.png`),
        png,
      );
    }
    if (args.includes("--preflight-only")) {
      await context.close();
      continue;
    }
    const final = path.join(out, `${config.name}-120.mp4`);
    const temp = path.join(
      out,
      `${config.name}-${refreshDesign ? "design" : refreshProcess ? "process" : "120"}.pending.mp4`,
    );
    if (refreshing) {
      const existing = probe(final);
      if (
        existing.width !== width ||
        existing.height !== height ||
        existing.avg_frame_rate !== "120/1" ||
        Number(existing.nb_read_frames) !== frames
      )
        throw new Error(
          "A partial refresh requires a verified full native export",
        );
    }
    const encoder = spawn(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-framerate",
        String(fps),
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-i",
        "pipe:0",
        "-an",
        "-vf",
        "scale=out_color_matrix=bt709",
        ...nativeOutput,
        temp,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let encoderError = "";
    encoder.stderr.on(
      "data",
      (text) => (encoderError = (encoderError + text).slice(-12000)),
    );
    const closed = once(encoder, "close");
    try {
      for (let i = captureStart; i < captureEnd; i++) {
        await advance(i / fps);
        const png = await capture();
        if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height)
          throw new Error("Frame lost native output resolution");
        if (
          [
            0, 480, 840, 900, 912, 928, 960, 1800, 2520, 2544, 2568, 2640, 3000,
            3001, 4103,
          ].includes(i)
        )
          fs.writeFileSync(path.join(evidence, `${config.name}-${i}.png`), png);
        if (!encoder.stdin.write(png)) await once(encoder.stdin, "drain");
        if (i && i % 240 === 0)
          console.log(`${config.name} ${i - captureStart}/${captureFrames}`);
      }
      encoder.stdin.end();
      const [code] = await closed;
      if (code !== 0) throw new Error(encoderError);
    } catch (error) {
      encoder.kill("SIGTERM");
      throw error;
    }
    if (errors.length || requests.length)
      throw new Error(
        JSON.stringify({ errors, externalAssistantRequests: requests }),
      );
    let assembled = temp;
    if (refreshing) {
      const refreshed = probe(temp);
      if (Number(refreshed.nb_read_frames) !== captureFrames)
        throw new Error("Incomplete interval refresh");
      assembled = path.join(out, `${config.name}-120.pending.mp4`);
      // Decode and trim at exact timeline times: hardware encoders may insert
      // extra keyframes, so stream-copy cuts are not reliable frame boundaries.
      const filter = refreshDesign
        ? "[0:v]setpts=PTS-STARTPTS[first];[1:v]trim=start=10,setpts=PTS-STARTPTS[second];[first][second]concat=n=2:v=1:a=0[joined]"
        : "[0:v]trim=end=8,setpts=PTS-STARTPTS[first];[1:v]setpts=PTS-STARTPTS[second];[first][second]concat=n=2:v=1:a=0[joined]";
      const inputs = refreshDesign ? [temp, final] : [final, temp];
      await transcode([
        "-i",
        inputs[0],
        "-i",
        inputs[1],
        "-filter_complex",
        filter,
        "-map",
        "[joined]",
        "-an",
        "-r",
        String(fps),
        ...nativeOutput,
        assembled,
      ]);
    }
    const meta = probe(assembled);
    if (
      meta.width !== width ||
      meta.height !== height ||
      meta.avg_frame_rate !== "120/1" ||
      Number(meta.nb_read_frames) !== frames
    )
      throw new Error("Incorrect final export: " + JSON.stringify(meta));
    const playback = await verifyMediaPlayback(browser, assembled);
    fs.renameSync(assembled, final);
    if (refreshing) fs.unlinkSync(temp);
    const previous = ledger.findIndex((item) => item.name === config.name);
    if (previous >= 0) ledger.splice(previous, 1);
    ledger.push({
      ...config,
      gpu,
      ...meta,
      playback,
      file: final,
      bytes: fs.statSync(final).size,
      errors,
      externalAssistantRequests: requests,
      ...(refreshDesign
        ? { refreshedSeconds: [0, 10], retainedSeconds: [10, duration] }
        : refreshProcess
          ? { refreshedSeconds: [8, duration], retainedSeconds: [0, 8] }
          : {}),
    });
    fs.writeFileSync(
      path.join(evidence, "render-ledger.json"),
      JSON.stringify(ledger, null, 2),
    );
    console.log("Completed " + config.name + " 120 FPS export");
    await context.close();
    derivatives.push(
      (async () => {
        const playbackTemp = path.join(out, `${config.name}.pending.mp4`),
          playback = path.join(out, `${config.name}.mp4`);
        await transcode([
          "-i",
          final,
          "-an",
          "-vf",
          `fps=60,scale=${config.playbackWidth}:-2`,
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-threads",
          "4",
          "-crf",
          "18",
          "-g",
          "2",
          "-bf",
          "0",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          playbackTemp,
        ]);
        const meta = probe(playbackTemp);
        if (
          meta.avg_frame_rate !== "60/1" ||
          Number(meta.nb_read_frames) !== frames / 2
        )
          throw new Error("Incorrect 60 FPS derivative");
        fs.renameSync(playbackTemp, playback);
        await transcode([
          "-ss",
          "8",
          "-i",
          final,
          "-frames:v",
          "1",
          "-vf",
          `scale=${config.playbackWidth}:-2`,
          "-c:v",
          "png",
          path.join(out, `${config.name}-poster.png`),
        ]);
        fs.writeFileSync(
          path.join(evidence, `${config.name}-playback.json`),
          JSON.stringify(
            { ...meta, file: playback, bytes: fs.statSync(playback).size },
            null,
            2,
          ),
        );
        console.log(
          "Completed " + config.name + " CPU-friendly playback derivative",
        );
      })().catch((error) => {
        derivativeErrors.push(String(error));
      }),
    );
  }
} finally {
  await browser.close();
}
await Promise.all(derivatives);
if (derivativeErrors.length) throw new Error(derivativeErrors.join("\n"));
console.log(
  args.includes("--preflight-only")
    ? "Landing render preflight passed."
    : "All landing media exports verified.",
);
