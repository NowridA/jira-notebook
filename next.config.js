/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Use this project dir so tailwindcss resolves from jira-notebook/node_modules
    root: __dirname,
  },
};

module.exports = nextConfig;
