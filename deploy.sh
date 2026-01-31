#!/bin/bash
set -e

SERVER="ubuntu@3.138.172.15"
KEY="~/.ssh/alex-pc.pem"

echo "=== Active Investor API Deployment ==="
echo "Target: $SERVER"

echo ""
echo "Step 1: Building TypeScript..."
npm run build

echo ""
echo "Step 2: Uploading backend to server..."
rsync -avz -e "ssh -i $KEY" \
  --exclude node_modules \
  --exclude .git \
  --exclude website \
  --exclude pitchdeck \
  --exclude plugin \
  --exclude tests \
  --exclude '*.test.ts' \
  --exclude 'test-*.ts' \
  --exclude 'test-*.js' \
  --exclude PLAN.md \
  --exclude '*.md' \
  --include 'skill.md' \
  ./ $SERVER:/home/ubuntu/active-investor/

echo ""
echo "Step 3: Copying .env to server (you may need to update it)..."
scp -i $KEY .env $SERVER:/home/ubuntu/active-investor/.env

echo ""
echo "Step 4: Installing dependencies and restarting..."
ssh -i $KEY $SERVER << 'EOF'
  cd /home/ubuntu/active-investor
  npm ci --only=production
  sudo docker compose down 2>/dev/null || true
  sudo docker compose up -d --build
  echo ""
  echo "Checking container status..."
  sudo docker compose ps
EOF

echo ""
echo "=== Deployment complete! ==="
echo "API running at: http://3.138.172.15:3000"
echo "Health check:   http://3.138.172.15:3000/health"
