#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${GREEN}=== 制造业订单管理系统 v5 启动脚本 ===${NC}"

# Check .env
if [ -z "$(grep 'ANTHROPIC_API_KEY=.' "$ROOT/.env" 2>/dev/null)" ]; then
  echo -e "${YELLOW}警告: .env 中未填写 ANTHROPIC_API_KEY，Excel 解析功能将不可用${NC}"
fi

# --- Backend ---
echo -e "\n${GREEN}[1/4] 安装后端依赖...${NC}"
cd "$ROOT/backend"
npm install --silent

echo -e "${GREEN}[2/4] 应用数据库迁移...${NC}"
cp "$ROOT/.env" "$ROOT/backend/.env" 2>/dev/null || true
npx prisma generate 2>&1 | grep -v "Update available\|major update\|follow the guide\|Run the following\|npm i" || true
npx prisma migrate deploy 2>&1 | grep -v "Update available\|major update\|follow the guide\|Run the following\|npm i" || true

# --- Frontend ---
echo -e "${GREEN}[3/4] 安装前端依赖...${NC}"
cd "$ROOT/frontend"
npm install --silent

echo -e "${GREEN}[4/4] 启动服务...${NC}"
cd "$ROOT/backend"
npx tsx src/index.ts &
BACKEND_PID=$!

cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo -e "\n${GREEN}✓ 系统已启动${NC}"
echo "  后端: http://localhost:3001"
echo "  前端: http://localhost:5173"
echo -e "\n按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '服务已停止'" EXIT
wait
