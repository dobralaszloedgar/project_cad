// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** Resolve only versioned public distribution locations. Shared by web and release tools.
 * @param {Record<string, unknown>} manifest
 * @returns {{baseUrl: string, releaseUrl?: string, checksumsUrl?: string, manifestUrl?: string}}
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
      release.tag !== `v${manifest.version}` ||
      (release.manifestFilename !== undefined &&
        (typeof release.manifestFilename !== "string" ||
          !/^downloads(?:-[a-z0-9]+)*\.json$/.test(
            release.manifestFilename,
          ))) ||
      (release.checksumsFilename !== undefined &&
        (typeof release.checksumsFilename !== "string" ||
          !/^SHA256SUMS(?:-[a-z0-9]+)*\.txt$/.test(release.checksumsFilename)))
    )
      throw new Error("Invalid assistant GitHub release.");
    const repositoryUrl = `https://github.com/${release.repository}`;
    const baseUrl = `${repositoryUrl}/releases/download/${release.tag}`;
    return {
      baseUrl,
      releaseUrl: `${repositoryUrl}/releases/tag/${release.tag}`,
      // Later platform builds can add metadata without replacing published assets.
      ...(release.manifestFilename
        ? { manifestUrl: `${baseUrl}/${release.manifestFilename}` }
        : {}),
      ...(release.checksumsFilename
        ? { checksumsUrl: `${baseUrl}/${release.checksumsFilename}` }
        : {}),
    };
  }
  return { baseUrl: "/downloads/assistant" };
}

/** Resolve a platform pinned to an earlier release in the same public store.
 * @param {Record<string, unknown>} manifest
 * @param {{version?: string}} file
 */
export function assistantDownloadFileLocation(manifest, file) {
  const location = assistantDownloadLocation(manifest);
  if (file.version === undefined || file.version === manifest.version)
    return location;
  if (typeof file.version !== "string" || !/^\d+\.\d+\.\d+$/.test(file.version))
    throw new Error("Invalid platform release version.");
  if (manifest.distribution)
    return assistantDownloadLocation({
      version: file.version,
      distribution: {
        provider: "vercel-blob",
        baseUrl: location.baseUrl.replace(
          /\/v\d+\.\d+\.\d+$/,
          `/v${file.version}`,
        ),
      },
    });
  if (manifest.release)
    return assistantDownloadLocation({
      version: file.version,
      release: {
        .../** @type {Record<string, unknown>} */ (manifest.release),
        tag: `v${file.version}`,
      },
    });
  throw new Error("Platform releases require public download storage.");
}
