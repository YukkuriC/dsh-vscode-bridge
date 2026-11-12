---
description: '每完成一个独立功能后使用：运行 npm run format 统一格式化全仓库，只在收尾、汇报或提交前运行，开发中途不反复跑'
---

# 格式化规则

每完成一个独立功能（一个可交付的改动告一段落）后，运行一次：

```powershell
npm run format
```

- 该命令使用仓库根的 `.prettierrc` 格式化全部文件；`build/`、`node_modules/` 等由 `.prettierignore` 排除。
- 只在功能收尾、准备汇报或提交前运行；功能开发中途不要反复运行，避免无关 diff 干扰。
- 如果格式化改动了本次功能之外的文件，照常保留并一起提交，保持全仓库风格统一。
- 需要只检查不修改时用 `npm run format:check`。
