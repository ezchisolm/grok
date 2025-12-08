# YouTube Cookies Setup Guide

**IMPORTANT**: Your bot needs YouTube cookies to work. YouTube is blocking requests from servers without authentication.

## Quick Start (Recommended)

The easiest way is to use yt-dlp locally to extract cookies from your browser:

```bash
# On your LOCAL machine (not the server), run:
yt-dlp --cookies-from-browser chrome --cookies cookies.txt --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Replace `chrome` with your browser: `firefox`, `edge`, `brave`, `safari`, `chromium`, etc.

This creates a `cookies.txt` file that you can upload to your server.

## Alternative: Browser Extension

If you don't have yt-dlp installed locally, use a browser extension:

### For Chrome/Edge:
1. Install the extension: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
2. Go to YouTube.com and make sure you're logged in
3. Click the extension icon
4. Click "Export" to download `cookies.txt`

### For Firefox:
1. Install the extension: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)
2. Go to YouTube.com and make sure you're logged in
3. Click the extension icon
4. Save the `cookies.txt` file

**Important**: Make sure you're logged into YouTube before exporting cookies!

## Uploading Cookies to Your Server

Once you have the `cookies.txt` file:

1. **Upload to your DigitalOcean droplet:**
   ```bash
   scp cookies.txt root@YOUR_DROPLET_IP:~/grok/cookies.txt
   ```

2. **Or manually paste the contents:**
   ```bash
   ssh root@YOUR_DROPLET_IP
   cd grok
   nano cookies.txt
   # Paste the contents, then Ctrl+X, Y, Enter to save
   ```

3. **Restart the bot:**
   ```bash
   pm2 restart grok-music
   ```

## Security Notes

- **NEVER commit `cookies.txt` to git** - it contains your login session
- Add `cookies.txt` to `.gitignore` (already done)
- The cookies will expire eventually - you may need to refresh them every few months

## Verifying It Works

After uploading cookies, check the logs:
```bash
pm2 logs grok-music
```

Try playing a song and you should no longer see the "Sign in to confirm you're not a bot" error.

## Troubleshooting

If you still get errors:
1. Make sure the `cookies.txt` file is in the root of the `grok` directory
2. Verify you're logged into YouTube in the browser you exported from
3. The cookies may have expired - try exporting fresh ones
4. Some regions/IPs may be heavily rate-limited by YouTube - consider using a VPN on your droplet
