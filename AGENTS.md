# 香港大战僵尸 Godot 工作约定

- 本目录独立于 HKVSZombie、HKVSZombie2 和 monster-proj，不修改它们。
- runtime/core 和 runtime/vendor 来自 HKVSZombie2 的 ff53022。保持这些文件逐字节一致；桥接、平台存储和展示放在外部适配层。任何玩法修改需要用户明确提出。
- Godot 负责所有游戏画面、界面、输入与音效；不嵌入旧 HTML 界面。Web 使用 JavaScriptBridge，Windows 使用随包附带的 JavaScript 运行时。
- 12 文明、84 兵种、6 巨兽、4 资源、并行队列、升本、维修、1v1–4v4、AI、排位、GM 和最近 5 场回放全部属于迁移范围。
- 仿真固定 30 Hz；渲染不修改仿真状态，插值和精灵动画只影响视觉。
- 角色使用新绘制的透明像素图集，不用几何图形替代角色。保存生成提示和素材来源；Fusion Pixel 字体附带 OFL。
- 作者令牌仅通过环境变量传入，不能写入代码、日志、导出包或 Git。
- 验证规则源码哈希、确定性结果、Godot 导入、Web 和 Windows 运行及界面截图。导出包和运行组件放 dist，不提交 Git。
