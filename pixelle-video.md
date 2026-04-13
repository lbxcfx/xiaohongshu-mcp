# Pixelle-Video 与 Ark Seedance 共存方案

## 结论

当前 `ai-marketing` 已经使用 Ark 的 Seedance 1.5 Pro 做视频生成。Pixelle-Video 可以与现有 Seedance 能力共存，并且建议共存。

最优逻辑不是让 Pixelle-Video 替代 Seedance，而是明确两者职责：

- Ark Seedance 1.5 Pro：负责单段高质量视频生成，适合文生视频、图生视频、短视频片段生成。
- Pixelle-Video：负责视频工作流编排，适合视频复刻、多分镜营销视频、素材混剪、TTS、字幕、BGM、模板和最终合成。

推荐架构：

```text
ai-marketing 前端
   |
   v
ai-marketing 后端：统一任务中心 / 策略路由 / 鉴权 / 额度 / OSS
   |
   |-- Ark Seedance Provider：单段视频生成
   |
   |-- Pixelle-Video Provider：复刻工作流 / 多分镜 / 合成 / 字幕 / BGM
         |
         |-- RunningHub / ComfyUI workflow
         |-- LLM
         |-- TTS
         |-- ffmpeg 合成
```

前端不需要知道底层使用 Seedance 还是 Pixelle-Video。前端只提交生成类型、参考素材、商品信息、目标时长、画面比例、是否需要口播、是否需要字幕、是否需要复刻风格等业务参数。

## 职责边界

| 场景 | 推荐引擎 | 原因 |
| --- | --- | --- |
| 简单文生视频 | Ark Seedance | 链路短，直接生成 |
| 单张商品图生成动态视频 | Ark Seedance | 图生视频能力直接 |
| 首帧/首尾帧控制的视频 | Ark Seedance | 更适合短视频片段生成 |
| 需要同步音频的短视频 | Ark Seedance 1.5 Pro | 可直接生成带音频视频 |
| 多分镜营销视频 | Pixelle-Video | 需要脚本、分镜、素材、字幕和合成 |
| 视频复刻 | Pixelle-Video 主导，Seedance 作为片段生成器 | Pixelle 负责分析和编排，Seedance 负责生成片段 |
| 素材混剪 | Pixelle-Video | asset-based pipeline 更适合 |
| 字幕、BGM、模板包装 | Pixelle-Video | 已有模板和 ffmpeg 合成链路 |
| 动作迁移、数字人、ComfyUI 特定工作流 | Pixelle-Video + RunningHub | Seedance 不覆盖这类复杂 workflow |
| 快速生成 5-12 秒广告素材 | Ark Seedance | 不需要复杂流水线 |

## 推荐路由逻辑

`ai-marketing` 后端增加统一的视频任务路由，根据任务类型选择引擎：

```text
quick_video       -> Ark Seedance
product_i2v       -> Ark Seedance
video_clone       -> Pixelle-Video
asset_remix       -> Pixelle-Video
long_marketing    -> Pixelle-Video
avatar_video      -> Pixelle-Video / RunningHub workflow
motion_transfer   -> Pixelle-Video / RunningHub workflow
```

Pixelle-Video 内部如果需要生成动态视频片段，可以再优先调用 Seedance：

```text
Pixelle 分镜编排
   |
   |-- 商品图动起来 -> Ark Seedance 图生视频
   |-- 纯 AI 场景 -> Ark Seedance 文生视频
   |-- 特殊 ComfyUI 能力 -> RunningHub workflow
   |-- 用户已有视频素材 -> 直接混剪
   |
Pixelle 统一加字幕、口播、BGM、模板
   |
输出最终视频
```

## 开发方案

### 阶段 1：服务级共存

先不要改 Pixelle-Video 源码。`ai-marketing` 后端新增 Pixelle-Video Provider，和现有 Ark Seedance Provider 并行存在。

目标：

- 保留现有 Ark Seedance 生成链路。
- 新增 Pixelle-Video 独立服务调用。
- 简单视频继续走 Seedance。
- 视频复刻、多分镜和素材混剪走 Pixelle-Video。

优点：

- 改动小。
- 不影响现有 Seedance 能力。
- Pixelle-Video 出问题不会影响原有视频生成。
- 可以灰度测试。
- 成本、耗时、失败率可以按 provider 分开统计。

### 阶段 2：统一任务中心

在 `ai-marketing` 后端收敛任务模型，屏蔽底层 provider 差异。

建议任务模型：

```text
video_tasks
- id
- user_id
- type
- provider
- status
- input_assets
- prompt
- aspect_ratio
- duration
- pixelle_task_id
- ark_task_id
- result_url
- error_message
- cost_estimate
- created_at
- updated_at
```

建议状态：

```text
pending
uploading
analyzing
scripting
generating_assets
composing
uploading_result
completed
failed
```

前端统一调用：

```text
POST /api/video/tasks
GET  /api/video/tasks/:id
POST /api/video/tasks/:id/retry
```

后端根据 `type` 和参数选择 provider。

### 阶段 3：视频复刻 MVP

优先实现“结构复刻”，不要第一版就做完全动作复刻。

流程：

```text
1. 用户上传参考视频、商品图、商品卖点。
2. ai-marketing 后端创建 video_clone 任务。
3. Pixelle-Video 分析参考视频的节奏、结构、文案风格。
4. LLM 生成同结构营销脚本。
5. 按分镜生成素材：
   - 商品图动起来：走 Ark Seedance。
   - 纯 AI 场景：走 Ark Seedance 或 RunningHub。
   - 用户已有素材：直接混剪。
6. Pixelle-Video 合成口播、字幕、BGM 和最终视频。
7. ai-marketing 后端上传结果到 OSS/CDN。
8. 前端展示最终视频。
```

第一版建议支持 3 个模式：

- 结构复刻：复刻参考视频结构、节奏和文案框架。
- 风格复刻：复刻视觉风格，重新生成素材。
- 素材混剪：使用用户上传图片/视频生成营销视频。

## Provider 抽象建议

在 `ai-marketing` 后端抽象统一接口：

```text
VideoGenerationProvider
```

实现：

```text
ArkSeedanceProvider
PixelleVideoProvider
```

统一输入：

```text
task_type
prompt
reference_video
product_images
aspect_ratio
duration
voice
bgm
style
```

统一输出：

```text
provider_task_id
status
progress
result_url
error_message
metadata
```

这样后续再接可灵、Runway、Pika、即梦、Sora、RunningHub 原生 API，都不需要改前端。

## 默认策略

推荐第一版使用以下规则：

```text
用户选择“快速生成”：
  走 Ark Seedance

用户选择“商品图动起来”：
  走 Ark Seedance 图生视频

用户选择“参考视频复刻”：
  走 Pixelle-Video

用户选择“多素材混剪”：
  走 Pixelle-Video asset-based

用户选择“营销长视频 / 多分镜视频”：
  走 Pixelle-Video

Pixelle 内部分镜需要生成动态视频时：
  优先调用 Ark Seedance
  如果需要 ComfyUI 特定能力，再调用 RunningHub workflow
```

## Pixelle-Video 配置建议

Pixelle-Video 作为内部服务部署，不直接暴露给前端。

推荐配置：

```yaml
comfyui:
  runninghub_api_key: "xxx"
  runninghub_concurrent_limit: 1

  image:
    default_workflow: runninghub/image_flux.json

  video:
    default_workflow: runninghub/video_wan2.1_fusionx.json
```

如果 TTS 也要求云端，需要固定使用 RunningHub TTS workflow 或独立云 TTS 服务，不建议让生产环境默认走不可控的本地配置。

workflow 不允许由前端传入，后端维护白名单：

```text
structure_clone:
  analysis: runninghub/analyse_video.json
  image: runninghub/image_flux.json
  video: runninghub/video_wan2.1_fusionx.json
  tts: runninghub/tts_edge.json

style_clone:
  analysis: runninghub/analyse_video.json
  image: runninghub/image_flux.json
  video: runninghub/video_wan2.1_fusionx.json

asset_remix:
  analysis_image: runninghub/analyse_image.json
  analysis_video: runninghub/analyse_video.json
  tts: runninghub/tts_edge.json
```

## 为什么不要全部切到 Pixelle-Video

Pixelle-Video 是视频生产流水线，不是单一视频模型服务。

如果任务只是“一张商品图生成 8 秒视频”，直接走 Seedance 更合适：

- 链路更短。
- 成本更容易计算。
- 状态更容易监控。
- 失败点更少。
- 生成速度更可控。

全部走 Pixelle-Video 会增加不必要的服务层、文件处理、任务状态和失败点。

## 为什么不要只用 Seedance

Seedance 适合生成短视频片段，但不负责完整营销视频工作流：

- 不负责长视频多分镜编排。
- 不负责参考视频结构分析。
- 不负责素材匹配。
- 不负责品牌模板。
- 不负责字幕、BGM、口播统一合成。
- 不负责复杂 ComfyUI workflow。

所以视频复刻、素材混剪、多分镜营销视频更适合 Pixelle-Video 主导。

## 风险与控制

### 成本风险

视频生成成本高于图像生成，特别是多分镜、动作迁移、数字人场景。

控制方式：

- 限制视频时长。
- 限制分镜数量。
- 限制每日额度。
- 按 provider 统计成本。
- 失败重试次数限制为 1 次。

### 稳定性风险

RunningHub workflow 和 Seedance 都可能出现排队、超时或失败。

控制方式：

- 所有任务异步化。
- 后端维护统一状态。
- provider 错误码统一映射。
- workflow 白名单。
- 任务超时自动失败。

### 质量风险

视频复刻生成质量受参考视频、商品素材、提示词和模型能力影响。

控制方式：

- 第一版优先做结构复刻和素材混剪。
- 动作迁移、数字人放到后续阶段。
- 提供重新生成能力。
- 保存中间脚本和分镜，方便调试。

### 合规风险

视频复刻涉及版权、肖像和声音克隆。

控制方式：

- 上传前增加授权确认。
- 声音克隆默认关闭。
- 对公开视频复刻增加版权提示。
- 生成结果可增加水印或来源标记。

## 最终建议

最优开发顺序：

```text
1. 保留 Ark Seedance 作为默认短视频生成引擎。
2. 新增 Pixelle-Video 作为视频复刻和多分镜营销视频引擎。
3. ai-marketing 后端做统一任务中心和 Provider 路由。
4. 第一版采用服务级共存，不改 Pixelle-Video 源码。
5. 第二版再考虑把 Ark Seedance 封装成 Pixelle-Video 的 video provider。
```

一句话方案：

Seedance 负责“生成单段好视频”，Pixelle-Video 负责“把多个能力编排成完整营销视频”。两者共存时，`ai-marketing` 后端做统一任务路由，简单视频走 Seedance，视频复刻和多分镜合成走 Pixelle-Video，Pixelle-Video 内部需要动态片段时再优先复用 Seedance。
