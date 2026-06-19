module.exports = {
  apps: [
    {
      name: "messenger-backend",
      cwd: __dirname,
      script: "dist/main.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 5000,
      max_memory_restart: "512M",
      watch: false,
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        DOTENV_CONFIG_PATH: ".env",
      },
    },
  ],
};
