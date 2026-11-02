// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  devIndicators: false,
};
export default config;
