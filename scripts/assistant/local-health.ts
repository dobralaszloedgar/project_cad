import { get } from "node:http";

// PackageKit can reject the socket QoS call made by Node's fetch/Undici.
// Use plain HTTP for this loopback probe so installer start/stop cannot crash
// in setTypeOfService before fetch's promise can reject.
export function assistantHealthy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const request = get(
        {
          hostname: "127.0.0.1",
          port,
          path: "/health",
          agent: false,
          signal: AbortSignal.timeout(1500),
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.destroy();
            resolve(false);
            return;
          }
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            body += chunk;
            if (body.length > 8192) {
              response.destroy();
              resolve(false);
            }
          });
          response.on("error", () => resolve(false));
          response.on("end", () => {
            try {
              const value = JSON.parse(body);
              resolve(
                value?.name === "Project CAD assistant" && value?.version === 1,
              );
            } catch {
              resolve(false);
            }
          });
        },
      );
      request.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}
