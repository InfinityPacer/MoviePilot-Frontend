# 玻璃滚动表面合成架构

## 状态

- 决策：采用原生背景底板与 surface-local SVG backdrop 位移，停止维护 document-sized scroll WebGL
  壁纸折射和独立动态光斑层。
- 适用范围：`balanced`、`high` 光学档的所有玻璃表面，包括侧边栏、顶栏与滚动内容。
- 兼容目标：Chrome 与 Safari 的稳定版本。支持 SVG backdrop filter reference 的浏览器启用真实位移；
  不支持的 Safari 版本降级为同参数的原生静态背板，不维护第二套伪流体。

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

所有玻璃表面采用统一的职责合同；displacement 与 backplate 在物理合成上属于同一条原生
`backdrop-filter` pipeline：

```text
GlassSurface
├── native backdrop pipeline
│   ├── surface-local displacement
│   └── blur / saturation / brightness
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

### Surface-local displacement

动态阶段属于表面自身，作为该表面唯一 `backdrop-filter` 链的首段，在 blur、saturation 与 brightness
之前对浏览器提供的 Backdrop Root Image 执行 SVG `feDisplacementMap`。它表达：

- pointer / touch flow；
- 真实背景纹理位移；
- 有界流动、惯性与衰减。

每个可见顶层表面只持有一个无像素输出的 SVG filter definition；表面仍由浏览器原生
`backdrop-filter` 捕获真实壁纸，不由应用解码、上传或计算壁纸坐标。位移、blur 与色彩处理在同一
filter list 中完成，禁止再叠加子元素 `backdrop-filter`。

Chrome 通过语法探测并由真实浏览器像素回归验证 SVG filter reference。Safari 稳定版在
`backdrop-filter: url(...)` 的真实位移通过同等像素回归前明确走静态降级，不只依赖可能误报的
`CSS.supports()`。支持时 `balanced/high` 开放动态参数；不支持时移除 filter reference，直接使用
原生 blur、saturation、brightness，并在设置界面隐藏动态参数与动态方案。降级路径不使用 CSS 光斑
模拟折射。

SVG filter definition 是 Chrome 当前的位移应用路径，不代表动态场只能由 SVG primitive 生成。若
真实浏览器校准证明 `feTurbulence` 无法达到所需流体细节，可引入有明确上限的 surface-attached
canvas / GPU pool 生成程序化 displacement field，但前提是目标浏览器提供并经像素回归证明该 field
能被同一原生 backdrop pipeline 直接消费。不能直接消费时，不得退化为独立 RGBA 光斑层或复制到
多个 surface Canvas2D。GPU 资源不得读取、缓存或上传真实壁纸，不得根据 `window.scrollY` 重建壁纸
坐标，也不得成为另一套完整玻璃 renderer。

引入 GPU field generator 时必须满足：

- 池大小具有桌面与移动端独立上限，只服务当前交互或少数高价值可见表面；
- surface 离开活动态后立即归还资源，不为常驻列表卡保留独立 context；
- context loss、DPR 与尺寸变化由统一恢复路径处理；
- 动态纹理提交延迟只能影响位移场演化，不能改变原生 backdrop 的壁纸位置、密度或 blur；
- OffscreenCanvas 只用于程序化场生成，不宣称解决 compositor 同步。
- 禁止共享 WebGL generator 每帧复制到多个 surface Canvas2D；能力验证必须覆盖真实 consumer、
  backing pixel、活动表面数、帧率与合成成本。

### Content

文字、图标、图片和交互控件不进入 displacement 输入，保持在背板之上。filter registry 不进入
可访问性树或命中测试，不得改变内容对比度合同。

## 统一呈现

侧边栏、顶栏、登录卡片和滚动内容不按定位方式选择不同 renderer。所有表面共享：

- 相同的 native backplate 语义；
- 相同的 pointer、touch、位移、惯性与 flow 模型；
- 相同的 displacement → blur → tone 顺序；
- 相同的 reduced motion / transparency 生命周期；
- 相同的材质参数来源。

表面尺寸、圆角与材质档位可以改变参数，但不得再由 fixed / scroll 分类改变视觉算法。旧 fixed WebGL
renderer、scroll WebGL renderer、真实壁纸纹理准备事务与双 context 激活协议在新架构中没有消费者，
直接删除。

## 材质身份

### 透明与色调

- native backplate 保持高通透度；
- displacement 直接改变真实 backdrop，不叠加独立亮色光斑；
- 不以提高全局 alpha 补偿缺少真实壁纸折射。

### 磨砂

- optical `balanced/high` 使用独立于 CSS 标准档的 blur 与 density；
- 不复用会把高频动态完全抹平的标准档高 blur；
- 位移位于 blur 之前，壁纸纹理在高通透设置下仍必须可辨；
- high 与 balanced 的差异来自位移幅度、噪声细节与动态响应，不是继续增大 blur。

### 参数合同

- 通透度：唯一控制 surface、raised、overlay 与 fixed 背板的遮罩密度和磨砂半径。
- 透射亮度：唯一控制 filter chain 的 brightness，不改变遮罩密度。
- 反射亮度：控制边缘、描边和静态镜面响应，不改变位移幅度。
- 流动偏移：控制位移噪声沿输入方向的推进距离。
- 局部形变：控制 `feDisplacementMap` 位移幅度与噪声空间尺度。
- 流动惯性：控制位移场速度衰减与能量半衰期。

参数必须各自存在可观察、可测试的消费者。标准档或不支持 SVG backdrop reference 的浏览器不显示
后三项动态参数；任何失去生产消费者的参数和预设应直接删除。

## Surface 生命周期

1. 统一管理 fixed、overlay 与 scroll 的顶层 surface；嵌套表面继续折叠。
2. MutationObserver 只响应候选 surface 的新增、删除；材质档位、能力状态和可见性由各自生命周期更新。
3. 页面切换、虚拟列表替换和 KeepAlive 恢复时重新同步 surface 集合。
4. mouse、touch 与 pen 统一使用 Pointer Events；直接触摸手势按 pointer 生命周期重置坐标，不并行消费
   legacy Touch Events。
5. 命中 surface 作为输入锚点，在既有可见 filter 预算内向邻近 surface 广播同相位速度，并按空间距离
   衰减能量；输入立即提交，连续输入在有界 freshness window 内保持当前速度，随后使用刷新率无关的
   解析指数 release。offset 必须限制在 filter bleed 内，并能在反向输入后退出边界。scroll 使用低幅统一
   位移，不生成逐卡光斑。
6. reduced motion 下关闭动态演化，只保留静态边缘响应。
7. reduced transparency 下移除 dynamics，并由现有 CSS fallback 接管。

filter definition 只分配给进入视口的顶层表面，离开视口立即释放。可见表面和滚动激活数量必须有
桌面与移动上限，避免常驻列表为不可见卡片保留 filter resource。

## 实施边界

- 新增统一的 surface-local dynamics composable。
- 在表面上建立 displacement、native blur/tone、content 的稳定绘制顺序。
- 把表面发现与输入生命周期从旧 renderer 中提取为独立合同。
- 删除 `GlassOpticalLayer`、document-sized canvas、wallpaper offset、surface scissor、WebGL 壁纸准备与
  激活事务，以及只服务这些路径的 shader、缓存、状态和测试。
- 透明、色调、磨砂分别校准背板密度、blur 与位移幅度。
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

- displacement 在同一 filter list 中先于 surface blur 执行。
- displacement 不处理或降低文字、图标和图片可读性。
- 不使用 nested backdrop-filter。
- 不为普通列表卡创建常驻 WebGL context。
- scroll surface 不再由应用代码采样、上传或补偿真实壁纸纹理坐标。

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
- 独立 CSS radial/conic 光斑冒充真实流体；
- 子伪元素再次执行 backdrop-filter；
- surface-attached GPU 重新采样、缓存或上传真实壁纸；
- 用更高 surface alpha、更大 blur 或更亮的后方 shader 掩盖缺失动态；
- 依赖 PaintWorklet、AnimationWorklet 或 ScrollTimeline 作为 Chrome/Safari 核心路径。

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
