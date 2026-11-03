// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chromium } from "@playwright/test";

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
const fps = 120,
  duration = 34.2,
  frames = Math.round(duration * fps);
const refreshDesign = args.includes("--refresh-design");
const captureFrames = refreshDesign ? 10 * fps : frames;
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
      "stream=width,height,avg_frame_rate,nb_read_frames,duration",
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
    const final = path.join(out, `${config.name}-120.mp4`);
    const temp = path.join(
      out,
      `${config.name}-${refreshDesign ? "design" : "120"}.pending.mp4`,
    );
    if (refreshDesign) {
      const existing = probe(final);
      if (
        existing.width !== width ||
        existing.height !== height ||
        existing.avg_frame_rate !== "120/1" ||
        Number(existing.nb_read_frames) !== frames
      )
        throw new Error(
          "Design refresh requires a verified full native export",
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
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-threads",
        "6",
        "-crf",
        "12",
        "-g",
        "6",
        "-keyint_min",
        "6",
        "-sc_threshold",
        "0",
        "-bf",
        "0",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
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
      for (let i = 0; i < captureFrames; i++) {
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
          console.log(`${config.name} ${i}/${captureFrames}`);
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
    if (refreshDesign) {
      const prefix = probe(temp);
      if (Number(prefix.nb_read_frames) !== captureFrames)
        throw new Error("Incomplete design refresh");
      const tail = path.join(evidence, `${config.name}-retained-tail.mp4`);
      const list = path.join(evidence, `${config.name}-concat.txt`);
      assembled = path.join(out, `${config.name}-120.pending.mp4`);
      await transcode(["-ss", "10", "-i", final, "-an", "-c:v", "copy", tail]);
      // Ten seconds is an exact GOP boundary in the native 120 FPS exports.
      const escaped = (file) => "file '" + file.replaceAll("'", "'\\''") + "'";
      fs.writeFileSync(list, [escaped(temp), escaped(tail)].join("\n") + "\n");
      await transcode([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-an",
        "-c:v",
        "copy",
        "-movflags",
        "+faststart",
        assembled,
      ]);
      fs.unlinkSync(tail);
      fs.unlinkSync(list);
    }
    const meta = probe(assembled);
    if (
      meta.width !== width ||
      meta.height !== height ||
      meta.avg_frame_rate !== "120/1" ||
      Number(meta.nb_read_frames) !== frames
    )
      throw new Error("Incorrect final export: " + JSON.stringify(meta));
    fs.renameSync(assembled, final);
    if (refreshDesign) fs.unlinkSync(temp);
    const previous = ledger.findIndex((item) => item.name === config.name);
    if (previous >= 0) ledger.splice(previous, 1);
    ledger.push({
      ...config,
      gpu,
      ...meta,
      file: final,
      bytes: fs.statSync(final).size,
      errors,
      externalAssistantRequests: requests,
      ...(refreshDesign
        ? { refreshedSeconds: [0, 10], retainedSeconds: [10, duration] }
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
console.log("All landing media exports verified.");
