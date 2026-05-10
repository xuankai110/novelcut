# NovelCut Skills

Each skill is a folder with `SKILL.md` (Markdown front-matter + body). The daemon loads them at startup.

## Pipeline

```
novel-to-events → events-to-skeleton → skeleton-to-episodes →
episode-to-script → script-to-shotlist → shot-to-image → image-to-video
```

## Asset skills (parallel)

- `character-design` — character reference sheet
- `scene-design` — location reference
- `cover-design` — vertical promotional cover (Xiaohongshu / Douyin)

## Status

Scaffold only. Bodies will be filled per pipeline stage.
