// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { tools, toolNames, type ToolName } from "../../../assistant/protocol";
import type { ProviderInput } from "./types";
import {
  ProjectFiles,
  projectFileTools,
  type ProjectFileTool,
} from "../project-files";
import { MuseProjectTools, museCapabilitiesRequest } from "./muse-tools";

export function museToolSchema(name: ToolName) {
  if (name === "get_capabilities")
    return z.toJSONSchema(museCapabilitiesRequest);
  if (
    name === "preview_actions" ||
    name === "propose_actions" ||
    name === "simulate"
  ) {
    // The action union exceeds Meta's maximum JSON-schema nesting depth. Keep
    // the full validator at the tool boundary and carry the plan as JSON text.
    const plan = z
      .string()
      .max(1_500_000)
      .describe(
        "JSON-encoded Project CAD plan object with summary and actions. Read get_capabilities for the action schema.",
      );
    return z.toJSONSchema(
      z
        .object({
          baseRevision: z.string().length(64),
          plan: name === "simulate" ? plan.optional() : plan,
        })
        .strict(),
    );
  }
  return z.toJSONSchema(tools[name].schema);
}

/** A per-turn, authenticated MCP server exposing only Project CAD operations. */
export async function projectMcp(input: ProviderInput, files?: ProjectFiles) {
  const projectTools = new MuseProjectTools(input);
  const token = randomBytes(32).toString("hex");
  const names = toolNames.filter(
    (name) =>
      input.conversation.mode !== "read-only" || name !== "propose_actions",
  );
  const fileNames = files
    ? (Object.keys(projectFileTools) as ProjectFileTool[]).filter(
        (name) =>
          input.conversation.mode !== "read-only" ||
          name === "list_project_files" ||
          name === "read_project_file",
      )
    : [];
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.headers.authorization !== `Bearer ${token}` || req.headers.origin)
      return json(403, { error: "Invalid project tool request." });
    if (req.method !== "POST") return json(405, { error: "Use POST." });
    let id: unknown = null;
    try {
      input.signal.throwIfAborted();
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2_000_000)
          throw new Error("Tool request is too large.");
      }
      const message = JSON.parse(body);
      id = message.id;
      if (id === undefined) {
        res.writeHead(202);
        res.end();
        return;
      }
      let result: unknown;
      if (message.method === "initialize")
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "project-cad", version: "1.0.0" },
        };
      else if (message.method === "ping") result = {};
      else if (message.method === "tools/list")
        result = {
          tools: [
            ...names.map((name) => ({
              name,
              description:
                name === "get_chemical_selection"
                  ? "Load verified chemicals and return catalogRef for a set_thermo_model action. Exact records stay in the adapter; do not copy coefficients or hashes. Reference valid for this turn. Does not apply changes."
                  : name === "get_capabilities"
                    ? "Read compact schemas, ports, models and units. Pass actionTypes for only the needed actions. Catalog actions use catalogRef; encode plans as JSON strings."
                    : tools[name].description,
              inputSchema: museToolSchema(name),
              // Proposals are only previews; the application owns review/apply.
              annotations: {
                readOnlyHint:
                  name !== "propose_actions" ||
                  input.conversation.mode !== "auto",
                destructiveHint: false,
                openWorldHint: false,
              },
            })),
            ...fileNames.map((name) => ({
              name,
              description: projectFileTools[name].description,
              inputSchema: z.toJSONSchema(projectFileTools[name].schema),
              annotations: {
                readOnlyHint:
                  name === "read_project_file" || name === "list_project_files",
                openWorldHint: false,
              },
            })),
          ],
        };
      else if (message.method === "tools/call") {
        const name = message.params?.name as ToolName;
        if (
          !names.includes(name) &&
          !fileNames.includes(name as unknown as ProjectFileTool)
        )
          throw new Error("Unknown or unavailable project tool.");
        try {
          const args = message.params.arguments;
          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  fileNames.includes(name as unknown as ProjectFileTool)
                    ? files!.call(name as unknown as ProjectFileTool, args)
                    : await projectTools.call(name, args),
                ),
              },
            ],
          };
        } catch (error) {
          result = {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  error instanceof Error
                    ? error.message
                    : "Project tool failed.",
              },
            ],
          };
        }
      } else
        return json(200, {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Unknown method." },
        });
      json(200, { jsonrpc: "2.0", id, result });
    } catch (error) {
      json(200, {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message:
            error instanceof Error ? error.message : "Invalid tool request.",
        },
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    config: {
      transport: "streamableHttp" as const,
      url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      headers: { Authorization: `Bearer ${token}` },
      mode: "required" as const,
    },
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
