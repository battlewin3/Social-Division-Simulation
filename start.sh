#!/usr/bin/env bash
#
# ABM 社会模拟 — 一键启动脚本
# 用法:
#   ./start.sh           交互式选择启动模式
#   ./start.sh docker    使用 Docker Compose 启动
#   ./start.sh dev       开发模式启动（前后端分别运行）
#   ./start.sh backend   仅启动后端
#   ./start.sh frontend  仅启动前端
#   ./start.sh test      运行后端测试
#

set -euo pipefail

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
AMBER='\033[0;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# ---- 横幅 ----
banner() {
  echo ""
  echo -e "${BLUE}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}${BOLD}║  社会模拟: 不平等均衡 — ABM 交互演示            ║${NC}"
  echo -e "${BLUE}${BOLD}║  Mijs & Usmani (2024) Social Forces             ║${NC}"
  echo -e "${BLUE}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ---- 检查依赖 ----
check_dependency() {
  local cmd="$1" name="$2"
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}[错误]${NC} 未找到 ${BOLD}$name${NC}，请先安装。"
    return 1
  fi
  echo -e "  ${GREEN}✓${NC} $name ($($cmd --version 2>&1 | head -1))"
}

check_all() {
  echo -e "${BOLD}检查依赖...${NC}"
  local ok=true
  check_dependency python3 "Python 3.11+" || ok=false
  check_dependency node "Node.js 18+" || ok=false
  check_dependency npm "npm" || ok=false
  if command -v docker &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Docker"
  else
    echo -e "  ${AMBER}○${NC} Docker (可选，仅 docker 模式需要)"
  fi
  if ! $ok; then
    echo -e "\n${RED}缺少必要依赖，请安装后重试。${NC}"
    exit 1
  fi
  echo ""
}

# ---- 安装依赖 ----
install_backend_deps() {
  echo -e "${BOLD}安装 Python 依赖...${NC}"
  cd "$PROJECT_ROOT/backend"
  if [ ! -d "venv" ]; then
    python3 -m venv venv
  fi
  source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null || true
  pip install -q -r requirements.txt
  echo -e "${GREEN}  ✓ 后端依赖安装完成${NC}"
  cd "$PROJECT_ROOT"
}

install_frontend_deps() {
  echo -e "${BOLD}安装前端依赖...${NC}"
  cd "$PROJECT_ROOT/frontend"
  npm install --silent
  echo -e "${GREEN}  ✓ 前端依赖安装完成${NC}"
  cd "$PROJECT_ROOT"
}

# ---- 启动模式 ----
run_docker() {
  echo -e "${BOLD}使用 Docker Compose 启动...${NC}"
  if ! command -v docker &>/dev/null; then
    echo -e "${RED}Docker 未安装，无法使用此模式。${NC}"
    exit 1
  fi
  docker compose up --build
}

run_dev() {
  echo -e "${BOLD}开发模式启动${NC}"
  echo -e "  后端: ${BLUE}http://localhost:8000${NC}"
  echo -e "  前端: ${BLUE}http://localhost:5173${NC}"
  echo ""

  # 启动后端
  cd "$PROJECT_ROOT/backend"
  source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null || true
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
  BACKEND_PID=$!
  echo -e "${GREEN}  ✓ 后端已启动 (PID: $BACKEND_PID)${NC}"

  # 启动前端
  cd "$PROJECT_ROOT/frontend"
  npm run dev &
  FRONTEND_PID=$!
  echo -e "${GREEN}  ✓ 前端已启动 (PID: $FRONTEND_PID)${NC}"

  echo ""
  echo -e "${AMBER}按 Ctrl+C 停止所有服务${NC}"

  # 捕获退出信号
  trap "echo ''; echo '正在停止...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
  wait
}

run_backend() {
  echo -e "${BOLD}仅启动后端...${NC}"
  echo -e "  API:  ${BLUE}http://localhost:8000${NC}"
  echo -e "  Docs: ${BLUE}http://localhost:8000/docs${NC}"
  echo ""
  cd "$PROJECT_ROOT/backend"
  source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null || true
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
}

run_frontend() {
  echo -e "${BOLD}仅启动前端...${NC}"
  echo -e "  URL: ${BLUE}http://localhost:5173${NC}"
  echo "  (需要后端运行在 localhost:8000)"
  echo ""
  cd "$PROJECT_ROOT/frontend"
  npm run dev
}

run_tests() {
  echo -e "${BOLD}运行后端测试...${NC}"
  cd "$PROJECT_ROOT/backend"
  source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null || true
  python -m pytest tests/ -v --tb=short
}

# ---- 交互式菜单 ----
interactive_menu() {
  echo -e "${BOLD}请选择启动模式:${NC}"
  echo ""
  echo "  ${BOLD}1)${NC} Docker Compose 启动 (推荐 — 前后端一体化)"
  echo "  ${BOLD}2)${NC} 开发模式 (前后端分别热重载)"
  echo "  ${BOLD}3)${NC} 仅启动后端 API"
  echo "  ${BOLD}4)${NC} 仅启动前端"
  echo "  ${BOLD}5)${NC} 运行测试"
  echo "  ${BOLD}q)${NC} 退出"
  echo ""
  read -r -p "输入选项 [1-5/q]: " choice

  case "$choice" in
    1) install_backend_deps; install_frontend_deps; run_docker ;;
    2) install_backend_deps; install_frontend_deps; run_dev ;;
    3) install_backend_deps; run_backend ;;
    4) install_frontend_deps; run_frontend ;;
    5) install_backend_deps; run_tests ;;
    q|Q) echo "已退出"; exit 0 ;;
    *) echo -e "${RED}无效选项${NC}"; interactive_menu ;;
  esac
}

# ---- 主入口 ----
main() {
  banner

  MODE="${1:-menu}"

  case "$MODE" in
    docker)   check_all; run_docker ;;
    dev)      check_all; install_backend_deps; install_frontend_deps; run_dev ;;
    backend)  check_all; install_backend_deps; run_backend ;;
    frontend) check_all; install_frontend_deps; run_frontend ;;
    test)     install_backend_deps; run_tests ;;
    menu|*)   check_all; interactive_menu ;;
  esac
}

main "$@"
