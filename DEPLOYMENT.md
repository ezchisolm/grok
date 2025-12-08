# Deployment Guide for DigitalOcean

This guide will help you deploy the Grok Music Bot to a DigitalOcean Droplet (Virtual Private Server) so it runs 24/7.

## 1. Create a Droplet
1.  Log in to your DigitalOcean account.
2.  Click **Create** -> **Droplets**.
3.  **Region**: Choose one close to you (e.g., New York, San Francisco, London).
4.  **Image**: Choose **Ubuntu 24.04 (LTS)** or **22.04 (LTS)**.
5.  **Size**: The **Basic** plan with **Regular** CPU, **1GB RAM / 1 CPU** ($6/month) is sufficient for this bot.
6.  **Authentication**: Choose **SSH Key** (recommended) or Password.
7.  Click **Create Droplet**.

## 2. Connect to the Server
Once the Droplet is created, copy its IP address. Open your terminal and run:
```bash
ssh root@YOUR_DROPLET_IP
```

## 3. Install Dependencies
Run the following commands on your server to install necessary tools:

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install FFmpeg (required for music), Python (for yt-dlp), and unzip
sudo apt install -y ffmpeg python3 unzip build-essential
```

## 4. Install Bun
Install the Bun runtime:
```bash
curl -fsSL https://bun.sh/install | bash
```
*Follow the on-screen instruction to add bun to your PATH (usually `source /root/.bashrc`).*

## 5. Setup the Bot
1.  **Clone your repository** (or upload your files):
    ```bash
    git clone https://github.com/YOUR_USERNAME/grok.git
    cd grok
    ```
    *(If your repo is private, you'll need to set up an SSH key or use a Personal Access Token)*

2.  **Install dependencies**:
    ```bash
    bun install
    ```
    *This will also automatically download `yt-dlp` via the postinstall script.*

3.  **Configure Environment Variables**:
    Create the `.env` file:
    ```bash
    nano .env
    ```
    Paste your variables (DISCORD_TOKEN, CLIENT_ID, etc.):
    ```env
    DISCORD_TOKEN=your_token_here
    CLIENT_ID=your_client_id_here
    GUILD_ID=your_guild_id_here
    ```
    Press `Ctrl+X`, then `Y`, then `Enter` to save.

4.  **Deploy Slash Commands** (run once):
    ```bash
    bun run deploy
    ```

## 6. Run with PM2 (Keep it alive)
We use PM2 to keep the bot running in the background and restart it if it crashes or the server reboots.

1.  **Install PM2 globally**:
    ```bash
    bun install -g pm2
    ```

2.  **Start the bot**:
    ```bash
    pm2 start ecosystem.config.cjs
    ```

3.  **Setup Startup Hook** (so it starts after server reboot):
    ```bash
    pm2 startup
    ```
    *Run the command it outputs.*
    ```bash
    pm2 save
    ```

## Maintenance
- **View Logs**: `pm2 logs grok-music`
- **Restart**: `pm2 restart grok-music`
- **Update Bot**:
    ```bash
    cd grok
    git pull
    bun install
    pm2 restart grok-music
    ```
