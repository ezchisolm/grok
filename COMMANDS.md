# Bot Commands Reference

This Discord music bot supports the following slash commands:

## 🎵 Music Playback

### `/play <query>`
Search YouTube and play a song in your voice channel.

**Parameters:**
- `query` (required): A song name to search or a direct YouTube URL

**Examples:**
```
/play never gonna give you up
/play https://www.youtube.com/watch?v=dQw4w9WgXcQ
/play lofi hip hop beats to study to
```

**Behavior:**
- If you provide a search query, the bot searches YouTube and plays the first result
- If you provide a YouTube URL, it plays that specific video
- The song is added to the queue if something is already playing
- The bot automatically joins your voice channel

---

### `/skip`
Skip the currently playing song and move to the next one in the queue.

**No parameters required**

**Example:**
```
/skip
```

**Behavior:**
- Stops the current song immediately
- Automatically starts playing the next song in the queue
- If the queue is empty, playback stops

---

### `/stop`
Stop playback completely and clear the entire queue.

**No parameters required**

**Example:**
```
/stop
```

**Behavior:**
- Stops the current song
- Clears all songs from the queue
- The bot will leave the voice channel after 60 seconds of inactivity

---

### `/pause`
Pause the currently playing song.

**No parameters required**

**Example:**
```
/pause
```

**Behavior:**
- Pauses playback at the current position
- Use `/resume` to continue playback

---

### `/resume`
Resume playback after pausing.

**No parameters required**

**Example:**
```
/resume
```

**Behavior:**
- Resumes playback from where it was paused
- If nothing is paused, the command has no effect

---

## 📋 Queue Management

### `/queue`
Display the current queue of songs.

**No parameters required**

**Example:**
```
/queue
```

**Behavior:**
- Shows the currently playing song
- Lists up to 10 upcoming songs
- Displays song duration and who requested each song
- If there are more than 10 songs, shows a count of remaining songs

**Sample Output:**
```
Now playing: **Rick Astley - Never Gonna Give You Up** (3:33) • requested by @User
Up next:
1. Darude - Sandstorm (3:46) • requested by @User
2. Queen - Bohemian Rhapsody (5:55) • requested by @AnotherUser
...and 5 more.
```

---

### `/nowplaying`
Show detailed information about the currently playing song.

**No parameters required**

**Example:**
```
/nowplaying
```

**Behavior:**
- Displays the title, duration, and requester of the current song
- If nothing is playing, informs you that the queue is empty

**Sample Output:**
```
Now playing: **Daft Punk - One More Time** (5:20) • requested by @User
```

---

## 📌 Tips

1. **Join a voice channel first**: You must be in a voice channel before using `/play`
2. **Queue multiple songs**: Use `/play` multiple times to build a queue
3. **Search is smart**: The bot will find the most relevant YouTube video for your search
4. **Auto-disconnect**: The bot leaves the voice channel after 60 seconds of inactivity
5. **Private use**: This bot is designed for private servers and small groups

## ⚠️ Troubleshooting

**Bot doesn't join voice channel:**
- Make sure you're in a voice channel
- Ensure the bot has permission to join and speak in voice channels

**No audio playing:**
- Check that the bot isn't muted in the voice channel
- Verify your voice channel region settings

**Search returns nothing:**
- Try using a more specific search query
- Try using a direct YouTube URL instead

**Commands not showing up:**
- Make sure slash commands have been deployed with `bun run deploy`
- Try restarting Discord or re-inviting the bot

---

For setup instructions and more information, see [README.md](README.md).
