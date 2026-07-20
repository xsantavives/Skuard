export default {
  projects: {
    default: {
      schema: "https://shopify.dev/admin-graphql-direct-proxy/2025-10",
      documents: ["app/**/*.{ts,tsx}"],
      extensions: {
        codegen: {
          preset: "@shopify/api-codegen-preset",
          pluckConfig: {
            skipIndent: true,
          },
        },
      },
    },
  },
};
