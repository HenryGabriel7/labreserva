import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/laboratorios/gerenciar",
        destination: "/admin/laboratorios",
        permanent: false,
      },
      { source: "/usuarios", destination: "/admin/usuarios", permanent: false },
      {
        source: "/configuracoes",
        destination: "/admin/configuracoes",
        permanent: false,
      },
      {
        source: "/auditoria",
        destination: "/admin/auditoria",
        permanent: false,
      },
      {
        source: "/relatorios",
        destination: "/admin/relatorios",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};
export default config;
