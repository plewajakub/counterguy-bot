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

- The project stores data in `voice_data.db` (SQLite).
- Do NOT commit your `.env` with the bot token. Keep it secret.

Docker (recommended for VPS)

1. Create `.env`

```bash
cp .env.example .env
# edit .env and set DISCORD_TOKEN (and optionally CLIENT_ID / GUILD_ID)
```

2. Run with Docker Compose

```bash
docker compose up -d --build
```

Data persistence

- The container writes the database to `/data/voice_data.db` (mounted as a named volume by default).

Deploy on a fresh Ubuntu VPS (quick checklist)

1. Install Docker + Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

2. Clone + configure

```bash
git clone <your-repo-url> counterguy-bot
cd counterguy-bot
cp .env.example .env
nano .env
```

3. Start

```bash
docker compose up -d --build
docker compose logs -f
```

Slash command usage

- `/voicetime leaderboard` — show top users by voice category.
- `/voicetime user target:@User` — show detailed stats for a user.
- Use the buttons under the user embed to switch between `today`, `week`, `month`, `year`, and `total`.
- Optionally set the range directly: `/voicetime user target:@User range:today`.
