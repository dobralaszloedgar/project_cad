/** Integrated Intel/AMD/Apple GPUs are hardware acceleration, not software. */
export function isSoftwareRenderer(name: string, fallbackAdapter = false) {
  return (
    fallbackAdapter ||
    /swiftshader|llvmpipe|softpipe|software (rasterizer|renderer)|basic render driver|\bwarp\b/i.test(
      name,
    )
  );
}
