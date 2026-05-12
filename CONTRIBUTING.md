# 贡献指南 / Contributing

感谢有兴趣给 NovelCut 提交改动!

## 提 PR 之前

1. 先开 issue 讨论一下设计,避免白干。小改动 / 文档 / typo 可以直接 PR。
2. 本地能跑通主流程:
   ```bash
   pnpm install
   pnpm --filter @novelcut/web dev
   ```
3. 类型检查:
   ```bash
   pnpm typecheck
   ```

## 代码规范

- TypeScript strict mode,不要 `any` 兜底。
- 组件优先函数式 + Hooks。
- 工作流相关的状态写在 `localStorage` 命名空间 `novelcut:v1:*`,
  服务端依赖 `~/.novelcut/cache/` 的内容寻址缓存。
- 中文 / 英文文案都可以,UI 默认中文;代码注释看团队习惯。

## Commit 信息

走 Conventional Commits 风格:
```
feat(storyboard): xxx
fix(retry): xxx
docs(readme): xxx
```

## 行为准则

请保持友好、专业。NovelCut 是一个用爱发电的开源项目,有想法、有讨论都欢迎。

---

# Contributing (EN)

Open an issue first for non-trivial changes. Use Conventional Commits.
Run `pnpm typecheck` before pushing. Be kind.
