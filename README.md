# 社会模拟: 不平等均衡 — ABM交互演示

基于 **Mijs & Usmani (2024)** *"How Segregation Ruins Inference: A Sociological Simulation of the Inequality Equilibrium"* (Social Forces, Vol. 103, No. 1) 的交互式复现演示。

## 快速开始

```bash
# 启动所有服务
docker compose up --build

# 访问前端
open http://localhost:5173
```

## 技术栈

- **后端**: Python + FastAPI + WebSocket
- **前端**: React 18 + TypeScript + Vite
- **可视化**: D3.js + Three.js (react-three-fiber)
- **设计**: TasteSkill Premium Utilitarian Minimalism
- **部署**: Docker Compose

## 开发模式

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 运行测试

```bash
cd backend
python -m pytest tests/ -v
```

## 模拟说明

本模拟展示了隔离如何系统地扭曲人们对不平等的认知。

### 核心机制

1. **4阶段生命历程**: 继承阶层 → 社区分配 → 学校分配 → 劳动收入
2. **种族歧视**: 贯穿各阶段的种族效应
3. **社交网络隔离**: 基于社会空间的Watts-Strogatz小世界网络
4. **推断偏差**: 隔离网络内的个体系统性低估不平等程度

### 6个场景预设

| 场景 | 描述 |
|------|------|
| 平等理想社会 | 无歧视，随机网络 |
| 美国现状 | 温和歧视 + 居住隔离 |
| 高度隔离社会 | 强歧视 + 社区隔离 |
| 精英主义幻觉 | 教育隔离为主 |
| 阶层决定论 | 阶层压倒种族 |
| 种族隔离最大化 | 全链路强歧视 |

### 关键参数

- 智能体数量 (200-2000)
- 少数群体比例 (5%-50%)
- 种族歧视系数 (4个阶段独立可调)
- 网络形成基础 (随机/社区/学校/收入)
- 网络规模与重连概率

## 目录结构

```
├── backend/          # Python模拟引擎 + FastAPI
│   ├── app/
│   │   ├── simulation/   # 核心模拟模块
│   │   └── main.py       # API入口
│   └── tests/
├── frontend/         # React交互界面
│   └── src/
│       └── components/
│           ├── controls/      # 参数控制面板
│           └── visualization/ # 可视化组件
└── docker-compose.yml
```
