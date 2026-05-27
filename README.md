# Counterguy Bot

Simple Discord voice-time tracking bot.

Prerequisites
- Node.js 16.9+ (recommended 18+)

Quick start

1. Install dependencies
```bash
npm install
```

2. Create `.env` from the example and set your token
```bash
cp .env.example .env
# edit .env and paste your token
```

3. Run
```bash
npm start
```

Development

- Use `npm run dev` with `ts-node-dev` to restart on changes.

Notes
- The project stores data in `voice_data.db` in the project folder.
- Do NOT commit your `.env` with the bot token. Keep it secret.

Slash command usage
- `/voicetime leaderboard` — show top users by voice category.
- `/voicetime user target:@User` — show detailed stats for a user.
- Use the buttons under the user embed to switch between `today`, `week`, `month`, `year`, and `total`.
- Optionally set the range directly: `/voicetime user target:@User range:today`.
