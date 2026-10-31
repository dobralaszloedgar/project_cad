import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Bind every release command to the configured owner's saved GitHub account. */
export async function githubPublisher(
  owner,
  execute = promisify(execFile),
  environment = process.env,
) {
  const env = {
    ...environment,
    GH_HOST: "github.com",
    GH_PROMPT_DISABLED: "1",
  };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  let token;
  try {
    const result = await execute(
      "gh",
      ["auth", "token", "--hostname", "github.com", "--user", owner],
      { env, timeout: 10000, maxBuffer: 16384 },
    );
    token = result.stdout.trim();
  } catch {
    throw new Error(`Sign in to the GitHub CLI as ${owner} before publishing.`);
  }
  if (!token)
    throw new Error(`No saved GitHub credentials were found for ${owner}.`);
  const authenticatedEnv = { ...env, GH_TOKEN: token };
  const gh = async (args) => {
    const { stdout } = await execute("gh", args, {
      env: authenticatedEnv,
      timeout: 900000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trim();
  };
  const account = JSON.parse(await gh(["api", "user"]));
  if (account.login?.toLowerCase() !== owner.toLowerCase())
    throw new Error(
      `The saved credentials do not belong to ${owner}. Publishing stopped.`,
    );
  return gh;
}
