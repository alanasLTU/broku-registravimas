import os from "node:os";
import type { NextConfig } from "next";

function lanDevOrigins() {
  const hosts = new Set<string>(["127.0.0.1"]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family);
      if ((family === "IPv4" || family === "4") && !addr.internal) {
        hosts.add(addr.address);
      }
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: lanDevOrigins(),
  devIndicators: false,
};

export default nextConfig;
