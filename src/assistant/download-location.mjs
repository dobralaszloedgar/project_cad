/** Resolve only versioned public distribution locations. Shared by web and release tools.
 * @param {Record<string, unknown>} manifest
 */
export function assistantDownloadLocation(manifest) {
  if (
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version)
  )
    throw new Error("Invalid assistant release version.");
  if (manifest.distribution !== undefined) {
    const distribution = /** @type {Record<string, unknown> | null} */ (
      manifest.distribution
    );
    if (
      !distribution ||
      typeof distribution !== "object" ||
      distribution.provider !== "vercel-blob" ||
      typeof distribution.baseUrl !== "string"
    )
      throw new Error("Invalid assistant distribution.");
    const url = new URL(distribution.baseUrl);
    const expectedPath = `/project-cad-assistant/v${manifest.version}`;
    if (
      !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) ||
      distribution.baseUrl !== `https://${url.hostname}${expectedPath}`
    )
      throw new Error(
        "Expected a versioned public Vercel Blob download location.",
      );
    return {
      baseUrl: distribution.baseUrl,
      checksumsUrl: `${distribution.baseUrl}/SHA256SUMS.txt`,
    };
  }
  if (manifest.release !== undefined) {
    const release = /** @type {Record<string, unknown> | null} */ (
      manifest.release
    );
    if (
      !release ||
      typeof release !== "object" ||
      typeof release.repository !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
        release.repository,
      ) ||
      release.tag !== `v${manifest.version}`
    )
      throw new Error("Invalid assistant GitHub release.");
    const repositoryUrl = `https://github.com/${release.repository}`;
    return {
      baseUrl: `${repositoryUrl}/releases/download/${release.tag}`,
      releaseUrl: `${repositoryUrl}/releases/tag/${release.tag}`,
    };
  }
  return { baseUrl: "/downloads/assistant" };
}
