module.exports = {
  apps: [{
    name: "grok-music",
    script: "src/index.ts",
    interpreter: "bun", // Use Bun to run the script directly
    env: {
      NODE_ENV: "production"
    }
  }]
}
