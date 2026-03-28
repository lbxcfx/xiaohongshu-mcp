# AI营销增长引擎 - Project TODO

## 基础架构
- [x] 数据库Schema设计（projects, positionings, topicHubItems, topics, scripts, materials, viralAnalyses, platformAdaptations, usageLogs）
- [x] tRPC路由结构搭建（projects/positioning/topicHub/topics/viralAnalysis/scripts/materials/platformAdaptation/dashboard）
- [x] 全局布局与导航（DashboardLayout - 深色科技风侧边栏）
- [x] 主题设计（深色AI科技风 - OKLCH色彩系统，Space Grotesk + Inter字体）
- [x] 路由配置（App.tsx - 完整路由树）
- [x] 着陆页（Home.tsx - 功能展示、特性介绍、CTA）

## 功能模块1：AI账号定位策划师
- [x] 账号分析表单（行业/赛道/变现方式/人设输入）
- [x] AI分析爆款账号特质（LLM调用，结构化分析）
- [x] AI交付账号定位建议（Markdown渲染输出）
- [x] 定位结果保存至项目数据库

## 功能模块2：AI选题信息中台
- [x] 手动Checklist输入热点模式
- [x] AI自动抓取推荐热点模式（LLM生成热点列表）
- [x] 抓取热帖爆款功能（LLM分析爆款内容）
- [x] 热点/爆款列表展示与删除
- [x] 分类Tab展示（全部/热点/爆款/手动）

## 功能模块3：AI选题生成
- [x] 结合热点+爆款+人设生成5条选题（LLM JSON结构化输出）
- [x] 选题类型标注（人设型/流量型/营销型）
- [x] 爆款潜力评级（高/中/低）
- [x] 选题状态管理（草稿/已选定/制作中/已发布）
- [x] 选题保存至项目选题库

## 功能模块4：AI爆款因子分析
- [x] 多维度分析表单（内容形式/拍摄/人设/情绪/内容/脚本）
- [x] AI 360度爆款公式提炼（LLM深度分析）
- [x] 分析结果Markdown渲染展示
- [x] 分析历史记录保存

## 功能模块5：AI脚本编导
- [x] 基于爆款公式+人设生成脚本（LLM调用）
- [x] 前三秒吸引力设计（分阵营/反认知/好奇感三选一）
- [x] 完整脚本结构（开头/中间/结尾）
- [x] 脚本状态管理（草稿/审核中/已通过/已制作）
- [x] 脚本一键复制功能
- [x] 脚本保存至脚本库

## 功能模块6：AI素材生成
- [x] 素材类型管理（真人口播/数字人/术前术后/其他）
- [x] 素材标签系统（部位/手术类型/风格/自定义标签）
- [x] 素材库管理与筛选
- [x] 素材状态追踪（上传中/处理中/可用/失败）

## 功能模块7：多平台适配
- [x] 小红书格式适配（标题+正文+话题标签+发布建议）
- [x] 抖音格式适配
- [x] Instagram格式适配
- [x] TikTok格式适配
- [x] YouTube格式适配
- [x] 一键生成多平台版本（LLM并行生成）
- [x] 适配结果复制功能

## 功能模块8：项目工作流管理
- [x] 创建/编辑/删除项目
- [x] 项目内独立管理定位/选题库/脚本库/素材库
- [x] 项目状态（进行中/已归档）
- [x] 项目详情页（7大功能模块入口）

## 功能模块9：数据看板
- [x] 各模块使用统计（项目数/选题数/脚本数/素材数/适配数/分析数）
- [x] 使用趋势图表（recharts折线图）
- [x] 最近活动记录
- [x] 快速操作入口

## 用户系统
- [x] 用户登录/注册（Manus OAuth）
- [x] 个人数据持久化（所有数据与userId关联）
- [x] 受保护路由（protectedProcedure）

## 测试
- [x] 25个单元测试全部通过（auth/projects/positioning/topicHub/topics/viralAnalysis/scripts/materials/dashboard）

## Enhancement Round 2

- [x] 真实数据源接入：选题中台接入TikTok搜索API
- [x] 真实数据源接入：选题中台接入YouTube搜索API
- [x] 真实数据源接入：指定账号分析接入TikTok/YouTube用户热帖API
- [x] AI数字人素材生成：接入HeyGen API（需用户提供API Key）
- [x] AI数字人素材生成：数字人生成UI（状态轮询、视频预览）
- [x] 内容发布集成：平台专属内容包生成（封面图/文案/话题标签）
- [x] 内容发布集成：AI生成封面图（接入内置imageGeneration）
- [x] 内容发布集成：内容包一键下载（.txt格式）
- [x] 更新TopicHub页面：展示真实API数据（TikTok/YouTube双标签页）
- [x] 更新MaterialGeneration页面：数字人生成流程（HeyGen集成）
- [x] 更新PlatformAdaptation页面：内容包生成与下载（封面图+标签+下载）

## Enhancement Round 3 - 去掉登录验证

- [ ] 后端：所有protectedProcedure改为publicProcedure，使用固定guest用户ID
- [ ] 前端：DashboardLayout去掉登录守卫和用户信息区域
- [ ] 前端：着陆页去掉登录CTA，直接进入工作台
- [ ] 前端：App.tsx去掉认证相关路由保护
