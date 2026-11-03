// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { chromium } from "@playwright/test";

/** Exercise Chrome's actual decoder continuously, including every transition. */
export async function verifyMediaPlayback(browser, file) {
  const size = fs.statSync(file).size;
  const server = http.createServer((request, response) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }
    response.writeHead(range ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    const stream = fs.createReadStream(file, { start, end });
    response.on("close", () => stream.destroy());
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const page = await browser.newPage();
  try {
    await page.setContent(
      `<video muted playsinline preload="auto" src="http://127.0.0.1:${server.address().port}/media.mp4"></video>`,
    );
    const result = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const video = document.querySelector("video");
          let timer = setTimeout(
            () => reject(new Error("Video metadata did not load")),
            15000,
          );
          const failed = () => {
            clearTimeout(timer);
            reject(
              new Error(
                `Video failed at ${video.currentTime}s: ${video.error?.message}`,
              ),
            );
          };
          video.addEventListener("error", failed);
          video.addEventListener("ended", () => {
            clearTimeout(timer);
            const quality = video.getVideoPlaybackQuality();
            resolve({
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
              totalFrames: quality.totalVideoFrames,
              droppedFrames: quality.droppedVideoFrames,
              ended: video.ended,
              decoderError: video.error?.message ?? null,
            });
          });
          const start = () => {
            clearTimeout(timer);
            timer = setTimeout(
              () =>
                reject(new Error(`Playback stalled at ${video.currentTime}s`)),
              video.duration * 2000 + 15000,
            );
            video.play().catch(reject);
          };
          if (video.error) failed();
          else if (video.readyState >= 1) start();
          else video.addEventListener("loadedmetadata", start, { once: true });
        }),
    );
    if (!result.ended || result.decoderError || result.totalFrames === 0)
      throw new Error(`Playback validation failed: ${JSON.stringify(result)}`);
    return result;
  } finally {
    await page.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length < 3)
    throw new Error("Pass at least one video file to verify");
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-gpu"],
  });
  try {
    for (const file of process.argv.slice(2)) {
      const result = await verifyMediaPlayback(browser, path.resolve(file));
      console.log(JSON.stringify({ file, ...result }));
    }
  } finally {
    await browser.close();
  }
}
