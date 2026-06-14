module.exports = {
  apps: [
    {
      name: "mobile-messenger-api",
      cwd: __dirname,
      script: "dist/main.js",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "development",
        DOTENV_CONFIG_PATH: ".env",
      },
      env_production: {
        NODE_ENV: "production",
        DOTENV_CONFIG_PATH: ".env.production",
      },
    },
  ],
};
