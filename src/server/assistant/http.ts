import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ASSISTANT_VERSION,
  projectIdSchema,
  submitSchema,
} from "../../assistant/protocol";
import { AssistantRuntime } from "./runtime";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function readBody(req: IncomingMessage, limit = 2_000_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > limit)
      throw new Error("Request exceeded the size limit.");
  }
  return body;
}
export function createAssistantServer(
  runtime: AssistantRuntime,
  options: { port: number; origins: string[] },
) {
  const origins = new Set(options.origins),
    tokens = new Map<string, string>();
  const pending = new Map<
    string,
    { origin: string; nonce: string; expires: number }
  >();
  function page(res: ServerResponse, body: string, script = "") {
    const nonce = randomBytes(18).toString("base64");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    });
    res.end(
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect Project CAD</title><style nonce="${nonce}">body{font:16px system-ui;color:#263d36;background:#f5f8f6;margin:48px auto;padding:24px;max-width:480px;line-height:1.6}button{background:#276f5b;color:white;border:0;border-radius:8px;padding:12px 20px;font:inherit;cursor:pointer}code{overflow-wrap:anywhere}h1{font-size:26px}</style>${body}<script nonce="${nonce}">${script}</script></html>`,
    );
  }
  const server = createServer(async (req, res) => {
    try {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : options.port;
      const ownOrigin = `http://127.0.0.1:${port}`;
      if (req.headers.host !== `127.0.0.1:${port}`)
        return json(res, 403, { error: "Invalid local host." });
      const url = new URL(req.url || "/", ownOrigin),
        origin = req.headers.origin;
      if (origin && origins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type, X-Project-CAD-Client",
        );
        res.setHeader("Access-Control-Allow-Private-Network", "true");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(origin && origins.has(origin) ? 204 : 403);
        return res.end();
      }
      if (url.pathname === "/health" && req.method === "GET")
        return json(res, 200, {
          name: "Project CAD assistant",
          version: ASSISTANT_VERSION,
        });
      if (url.pathname === "/connect" && req.method === "GET") {
        const target = url.searchParams.get("origin") || "",
          nonce = url.searchParams.get("nonce") || "";
        if (!origins.has(target) || !z.string().uuid().safeParse(nonce).success)
          return json(res, 403, {
            error: "This application origin is not enabled for Project CAD.",
          });
        for (const [id, entry] of pending)
          if (Date.now() > entry.expires) pending.delete(id);
        if (pending.size >= 50)
          return json(res, 429, { error: "Too many pending connections." });
        const csrf = randomBytes(32).toString("hex");
        pending.set(csrf, {
          origin: target,
          nonce,
          expires: Date.now() + 120000,
        });
        return page(
          res,
          `<h1>Connect Project CAD</h1><p>Allow <code>${escape(target)}</code> to use this laptop’s assistant and project conversation history?</p><p>Project changes remain subject to your review in the application.</p><form method="post" action="/connect"><input type="hidden" name="csrf" value="${csrf}"><button>Connect assistant</button></form>`,
        );
      }
      if (url.pathname === "/connect" && req.method === "POST") {
        if (
          origin !== ownOrigin ||
          !req.headers["content-type"]?.startsWith(
            "application/x-www-form-urlencoded",
          )
        )
          return json(res, 403, { error: "Invalid connection request." });
        const csrf = new URLSearchParams(await readBody(req)).get("csrf") || "",
          entry = pending.get(csrf);
        pending.delete(csrf);
        if (!entry || entry.expires < Date.now())
          return page(
            res,
            "<h1>Connection expired</h1><p>Return to Project CAD and connect again.</p>",
          );
        if (tokens.size >= 100) tokens.delete(tokens.keys().next().value!);
        const token = randomBytes(32).toString("base64url");
        tokens.set(token, entry.origin);
        const payload = JSON.stringify({
          type: "project-cad-assistant-connected",
          nonce: entry.nonce,
          token,
        }).replace(/</g, "\\u003c");
        return page(
          res,
          "<h1>Connected</h1><p>You can return to Project CAD.</p>",
          `if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(entry.origin).replace(/</g, "\\u003c")});window.close();}`,
        );
      }
      const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
      let authorized = false;
      if (origin && origins.has(origin))
        for (const [candidate, target] of tokens)
          if (
            target === origin &&
            candidate.length === token.length &&
            timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
          ) {
            authorized = true;
            break;
          }
      if (!authorized)
        return json(res, 401, {
          error: "Connect the local assistant to continue.",
        });
      const clientId = z
        .string()
        .uuid()
        .parse(req.headers["x-project-cad-client"]);
      if (url.pathname === "/providers" && req.method === "GET")
        return json(
          res,
          200,
          await runtime.providers(url.searchParams.get("refresh") === "1"),
        );
      const projectId = projectIdSchema.parse(
          url.searchParams.get("projectId"),
        ),
        scope = { origin: origin!, projectId, clientId };
      if (req.method === "GET" && url.pathname === "/state")
        return json(
          res,
          200,
          runtime.snapshot(
            scope,
            url.searchParams.get("conversationId") || undefined,
          ),
        );
      if (
        req.method !== "POST" ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return json(res, 405, { error: "Expected a JSON POST request." });
      const body = JSON.parse(
        await readBody(req, url.pathname === "/send" ? 14_000_000 : 2_000_000),
      );
      if (url.pathname === "/conversations")
        return json(res, 200, await runtime.create(scope, body));
      if (url.pathname === "/conversation") {
        const value = z
          .object({
            conversationId: z.string().uuid(),
            title: z.string().trim().min(1).max(100).optional(),
            archived: z.boolean().optional(),
          })
          .strict()
          .parse(body);
        return json(
          res,
          200,
          runtime.updateConversation(scope, value.conversationId, value),
        );
      }
      if (url.pathname === "/send") {
        const value = submitSchema
          .extend({ conversationId: z.string().uuid() })
          .parse(body);
        return json(
          res,
          200,
          runtime.start(scope, value.conversationId, {
            requestId: value.requestId,
            message: value.message,
            attachments: value.attachments,
          }),
        );
      }
      if (url.pathname === "/tool-result") {
        const value = z
          .object({
            id: z.string().uuid(),
            value: z.unknown().optional(),
            error: z.string().max(2000).optional(),
          })
          .strict()
          .parse(body);
        runtime.answer(scope, value.id, value);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/proposal") {
        const value = z
          .object({
            conversationId: z.string().uuid(),
            proposalId: z.string().uuid(),
            status: z.enum(["applied", "dismissed"]),
            result: z.string().max(1200),
          })
          .strict()
          .parse(body);
        return json(
          res,
          200,
          runtime.decide(
            scope,
            value.conversationId,
            value.proposalId,
            value.status,
            value.result,
          ),
        );
      }
      if (url.pathname === "/stop") {
        runtime.cancel(scope);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/detach") {
        runtime.detach(scope);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: "Unknown assistant endpoint." });
    } catch (error) {
      json(res, 400, {
        error:
          error instanceof z.ZodError
            ? "Invalid assistant request."
            : error instanceof Error
              ? error.message
              : "Assistant request failed.",
      });
    }
  });
  return server;
}
