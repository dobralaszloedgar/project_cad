// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** Integrated Intel/AMD/Apple GPUs are hardware acceleration, not software. */
export function isSoftwareRenderer(name: string, fallbackAdapter = false) {
  return (
    fallbackAdapter ||
    /swiftshader|llvmpipe|softpipe|software (rasterizer|renderer)|basic render driver|\bwarp\b/i.test(
      name,
    )
  );
}
