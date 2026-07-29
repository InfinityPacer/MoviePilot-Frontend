# 玻璃滚动表面合成架构

## 状态

- 决策：采用原生背景底板与 surface-local 动态前景分层，停止维护 document-sized scroll WebGL 壁纸折射。
- 适用范围：`balanced`、`high` 光学档的所有玻璃表面，包括侧边栏、顶栏与滚动内容。
- 兼容目标：Chrome、Safari、Firefox 的稳定版本；不把实验性 worklet 或单引擎能力作为核心路径。

## 问题

现有 scroll renderer 使用随文档滚动的 absolute canvas，并在 shader 中用 `documentPixels - uScrollOffset`
恢复固定壁纸的 viewport 采样坐标。浏览器异步滚动时，compositor 可以先移动上一张 canvas bitmap，
而新的 scroll offset、DOM rect、WebGL uniform 和绘制结果只能在后续主线程 rendering update 中提交。
这两个动作无法成为同一个 compositor 原子操作，因此会短暂显示上一视口相位的壁纸轮廓。

以下手段只能改变错误窗口，不能消除竞态：

- 提前监听 wheel、touch 或 keydown；
- 在 scroll handler 或 rAF 中立即写 uniform；
- 扩大 scissor、预绘相邻 band 或清除旧 band；
- 冻结、预测或平滑恢复壁纸采样相位；
- 在滚动开始和结束之间切换 native 与 WebGL 材质；
- 将绘制迁移到 OffscreenCanvas。

截至 2026-07-29，主流三引擎没有共同支持的 Web API，可以让共享 WebGL renderer 在同一 compositor
frame 中取得当前异步滚动相位并采样已经合成的任意 DOM backdrop。

## 决策

所有玻璃表面采用统一的三层表面合同：

```text
GlassSurface
├── native backplate
├── surface-local dynamics
└── content
```

### Native backplate

浏览器原生层负责：

- 真实固定壁纸采样；
- blur、saturation、brightness；
- tint、surface density；
- 圆角裁剪；
- 与异步滚动同步。

该层在滚动开始、滚动结束和静止态之间不切换实现，也不改变材质密度。

### Surface-local dynamics

动态层属于表面自身，位于 backplate 之后、content 之前。它只表达不依赖真实 backdrop 像素的：

- pointer / touch flow；
- 局部高光；
- 焦散；
- 边缘受光；
- 有界尾迹与衰减。

动态层随 DOM surface 一起由 compositor 移动，不读取 `window.scrollY` 来补偿壁纸坐标。实现可以使用
surface-local CSS plane 或有上限、可复用的 local canvas 资源，但所有表面必须共享同一动态模型与
生命周期。不得为每个常驻卡片创建独立 WebGL context。

### Content

文字、图标、图片和交互控件保持在 dynamics 之上。动态层必须 `pointer-events: none`，不得改变
可访问性树、命中测试或内容对比度合同。

## 统一呈现

侧边栏、顶栏、登录卡片和滚动内容不按定位方式选择不同 renderer。所有表面共享：

- 相同的 native backplate 语义；
- 相同的 pointer、touch、trail、wake 与 flow 模型；
- 相同的动态层混合顺序；
- 相同的 reduced motion / transparency 生命周期；
- 相同的材质参数来源。

表面尺寸、圆角与材质档位可以改变参数，但不得再由 fixed / scroll 分类改变视觉算法。旧 fixed WebGL
renderer、scroll WebGL renderer、真实壁纸纹理准备事务与双 context 激活协议在新架构中没有消费者，
直接删除。

## 材质身份

### 透明与色调

- native backplate 保持高通透度；
- dynamics 使用克制的 source-over 作为默认混合；
- 不以提高全局 alpha 补偿缺少真实壁纸折射。

### 磨砂

- optical `balanced/high` 使用独立于 CSS 标准档的 blur 与 density；
- 不复用会把高频动态完全抹平的标准档高 blur；
- edge、specular、caustic 位于 blur 之后；
- high 与 balanced 的差异来自动态响应和细节，而不是继续增大 blur。

`screen` 或 `plus-lighter` 只能作为隔离实验；默认先使用 premultiplied-alpha source-over，避免亮壁纸、
HDR 输出和高反射设置下截白。

## Surface 生命周期

1. 只管理 renderer 已认可的顶层 scroll surface；嵌套表面继续折叠。
2. MutationObserver 只响应候选 surface 的新增、删除和显式模式变化。
3. 页面切换、虚拟列表替换和 KeepAlive 恢复时重新同步 surface 集合。
4. pointer、touchstart、touchmove、touchend 复用唯一 interaction source。
5. 同一时刻只激活命中 surface；离开后按有界时长衰减。
6. reduced motion 下关闭尾迹演化，只保留静态边缘响应。
7. reduced transparency 下移除 dynamics，并由现有 CSS fallback 接管。

若后续引入 canvas pool：

- 池大小必须有明确上限；
- 仅 hover、focus、drag、touch-active 或少数高价值 surface 占用；
- 离开活动态立即归还；
- context loss、尺寸变化和 DPR 变化必须有集中恢复路径；
- OffscreenCanvas 只作为程序化场生成器，不宣称解决 compositor 同步。

## 实施边界

- 新增统一的 surface-local dynamics composable。
- 在表面上建立 native backplate、dynamics、content 的稳定绘制顺序。
- 把表面发现与输入生命周期从旧 renderer 中提取为独立合同。
- 删除 `GlassOpticalLayer`、document-sized canvas、wallpaper offset、surface scissor、WebGL 壁纸准备与
  激活事务，以及只服务这些路径的 shader、缓存、状态和测试。
- 透明、色调、磨砂分别校准 backplate 与 source-over 动态能量。
- 覆盖 pointer、touch scroll、hover lift、圆角、低梯度壁纸、虚拟列表替换和页面切换。
- 不保留迁移开关、兼容接口或没有生产消费者的旧实现。

## 验收标准

### 行为

- Dashboard、搜索结果和增量加载长列表快速滚动无旧壁纸轮廓。
- 滚动结束无整页亮度、密度或 blur 跳变。
- 透明、色调、磨砂均有可辨 surface-local 动态响应。
- frosted optical 与 CSS 标准档保持可辨通透度和动态身份。
- sidebar/navbar 与内容表面的流体语言一致，强度差异只来自材质和表面尺寸参数。

### 合成

- dynamics 不经过 surface 的 backdrop blur。
- dynamics 不覆盖或降低文字、图标和图片可读性。
- 不使用 nested backdrop-filter。
- 不为普通列表卡创建常驻 WebGL context。
- scroll surface 不再采样真实壁纸纹理。

### 工程

- surface 新增、移除、虚拟列表替换和路由切换有行为测试。
- pointer 与 touch 生命周期、reduced motion/transparency 有测试。
- 旧 wallpaper prepare/activate/rollback 事务及父层无消费者接口被删除。
- 完整 Vitest、typecheck、lint、suppression prune、build 与 diff check 通过。
- 桌面与移动端真实浏览器完成 clear/tinted/frosted 的滚动和交互矩阵。

## 明确不采用

- document absolute shared canvas 继续采样真实固定壁纸；
- fixed viewport WebGL renderer 作为另一套长期视觉路径；
- phase freeze、scroll prediction 或 scrollend 回弹；
- fixed viewport canvas 加主线程 rect mask 并宣称精确同步；
- 滚动时 native、静止时 full WebGL 的模式切换；
- 常驻 per-card WebGL context；
- 用更高 surface alpha、更大 blur 或更亮的后方 shader 掩盖缺失动态；
- 依赖 PaintWorklet、AnimationWorklet 或 ScrollTimeline 作为三引擎核心路径。

## 依据

- [HTML Living Standard：事件循环与 rendering update](https://html.spec.whatwg.org/multipage/webappapis.html)
- [Chromium RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture)
- [Firefox Async Pan/Zoom](https://firefox-source-docs.mozilla.org/gfx/AsyncPanZoom.html)
- [Firefox scroll-linked effects](https://firefox-source-docs.mozilla.org/performance/scroll-linked_effects.html)
- [CSS Scroll-driven Animations Level 1](https://www.w3.org/TR/scroll-animations-1/)
- [WebGL 1.0 Specification](https://registry.khronos.org/webgl/specs/latest/1.0/index.html)
- [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)
- [WebKit：Introducing Backdrop Filters](https://webkit.org/blog/3632/introducing-backdrop-filters/)
- [Three.js：Multiple Scenes](https://threejs.org/manual/#en/multiple-scenes)
- [Apple HIG：Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [WWDC25：Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [MDN：OffscreenCanvas.transferToImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap)
