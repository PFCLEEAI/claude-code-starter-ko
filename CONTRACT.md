# Build contract — Claude Code 기초 레퍼런스 (Korean, one page)

Audience: Korean bootcamp students, age 20–35, mostly non-developers; many have never opened Claude Code.
They study at home after class. Goal: one searchable, blog-style page that fills the gaps the
curriculum assumes (Claude Code from day 2, then skills / subagents / MCP / hooks / GitHub / Vercel).
Deep dives link out to CC101 (https://cc101.axwith.com/ko) and the official docs — do not copy CC101.

## Layout

```
src/sections/NN-slug.html   one fragment per section (writers own these)
src/data/commands.json      every command row (section 06 renders it)
src/data/glossary.json      glossary rows (section 09 renders it)
src/shell.html              page template: {{TOC}} {{SECTIONS}} {{DATA}} placeholders (shell lane)
docs/style.css docs/app.js  inline-free assets (shell lane)
scripts/build.py            concatenates sections in filename order -> docs/index.html (shell lane)
scripts/check.py            headless render check (shell lane)
```
GitHub Pages serves `/docs`. No backend, no analytics, $0.

## Section fragments

Each file is exactly one element:

```html
<section id="SLUG" class="chapter" data-title="짧은 한글 제목" data-emoji="🧭">
  <h2>제목</h2>
  <div class="tldr"><strong>3줄 요약</strong><ul><li>…</li><li>…</li><li>…</li></ul></div>
  … body …
</section>
```
- `h2` once per section; sub-topics use `<h3 id="SLUG-sub">` (ids unique, lowercase ascii, hyphens). The TOC is built from h2/h3.
- No `<script>`, no `<style>`, no inline `style=""`, no external images. Emoji are fine.

## Allowed components (only these classes)

| Use | Markup |
|---|---|
| Tip / warning / note | `<div class="callout tip">💡 …</div>`, `callout warn` (⚠️), `callout note` (📌) |
| Everyday analogy | `<div class="analogy"><strong>비유</strong> …</div>` |
| Diagram | `<figure class="diagram"><pre class="mermaid">…</pre><figcaption>…</figcaption></figure>` |
| Table | `<div class="table-wrap"><table>…</table></div>` |
| Card grid | `<div class="cards"><div class="card"><h4>…</h4><p>…</p></div>…</div>` |
| Steps | `<ol class="steps"><li>…</li></ol>` |
| Prompt example | `<div class="prompt bad"><span class="label">😕 이렇게 말고</span><pre>…</pre></div>` and `prompt good` (`✅ 이렇게`) |
| Code / keys | `<pre><code>…</code></pre>`, inline `<code>`, keys `<kbd>Esc</kbd>` |
| Optional depth | `<details class="deep"><summary>더 알아보기</summary>…</details>` |
| Worked example | `<div class="example"><span class="label">🧪 예시</span><p>상황…</p><pre>따라 칠 프롬프트/명령</pre><p>결과…</p></div>` |
| Link out | `<a class="ref" href="…" target="_blank" rel="noopener">CC101 13장 ↗</a>` |

## Mermaid rules (render breaks otherwise)
- Mermaid v11. Wrap every node label in double quotes: `A["컨텍스트 창"] --> B["답변"]`. No raw `( ) [ ] { } : ;` inside unquoted labels. Use `<br/>` for line breaks inside quotes.
- Keep diagrams small: ≤ 12 nodes. Prefer `flowchart LR/TD`, `sequenceDiagram`, `gitGraph`, `mindmap`.
- No `%%{init}%%` theme blocks (the shell sets the theme). Escape `&` `<` `>` as HTML entities inside `<pre class="mermaid">`.
- Every concept that confuses beginners gets a diagram or an analogy. Aim for 1–3 diagrams per concept section.

## Writing style
- 해요체, friendly blog tone, short paragraphs (≤ 3 sentences), one idea per paragraph. Explain like to a smart friend who has never coded.
- Keep English product/feature terms as-is on first use with Korean gloss: `컨텍스트(context)`, `스킬(Skill)`.
- Natural Korean, not translated-sounding. Avoid AI tells: no "~것입니다" chains, no "다양한/효과적인/혁신적인" filler, no "결론적으로", no em-dash overuse, no triple-adjective lists, no closing pep-talk paragraph.
- Compact: each section should be readable in 5–8 minutes. Breadth over depth; link out for depth.
- Facts about Claude Code commands/features come ONLY from `facts.md` (verified against official docs). If a fact is not there and you are not sure, leave it out. Never invent commands or flags.
- No sponsor or organizer logos/branding. Neutral title: "AI 빌더 기초 레퍼런스".

## Data files

`commands.json`: array of
```json
{"cat":"slash|cli|key|prefix","cmd":"/compact","desc":"한 줄 한글 설명","ex":"/compact 결정사항만 남겨줘","level":1,"tags":["컨텍스트"]}
```
`level`: 1 = 첫 주에 꼭, 2 = 익숙해지면, 3 = 고급. Every row must be backed by facts.md.

`glossary.json`: array of
```json
{"term":"컨텍스트","en":"Context","def":"한두 문장 정의","see":"basics-context"}
```
`see` = an h3/section id that exists in the page.

## Section map (filename → owner lane)

| File | id | Content |
|---|---|---|
| 00-start.html | start | 이 페이지 사용법 + 전체 지도 mindmap + 공부 순서 |
| 01-landscape.html | landscape | LLM이란, 모델 vs 앱, Claude.ai 채팅 vs Claude Code vs Cowork vs Claude in Chrome, ChatGPT/Codex/Gemini/Cursor, "뭘 쓰지?" 결정 플로우 |
| 02-basics.html | basics | 파일·폴더·터미널, MD 파일, 토큰, 컨텍스트(책상 비유 + 그림), API(식당 웨이터 비유) |
| 03-components.html | components | CLAUDE.md(전역/프로젝트/로컬, 우선순위 그림), 메모리, 권한 모드·플랜 모드, 스킬·플러그인·MCP·훅·서브에이전트 + 한 장 비교표 + "Claude Code 해부도" |
| 04-prompt-basics.html | prompt | 좋은 요청의 구조(역할·맥락·작업·형식·제약), 나쁜/좋은 예 |
| 05-prompt-eng.html | prompt-eng | zero/one/few-shot, CoT, 역할, 구조화(XML/마크다운), 출력 형식, 프롬프트 체이닝, 셀프 검토, 인터뷰형(AI가 질문), 이미지·영상 프롬프트 기초 |
| 06-commands.html | commands | 짧은 소개 + TOP 10 카드 + `<div id="cmd-app"></div>` (filterable table rendered by app.js) |
| 07-agents.html | agents | 에이전트 루프, 컨텍스트 관리, 하네스, 워크플로우 vs 에이전트(5가지 패턴), 에이전트 그래프, 서브에이전트·병렬, Ralph 루프/반복 루프, 인터뷰(grill-me) 스킬, 계획→실행→검증, 사람이 끼어드는 지점 |
| 08-github.html | github | 왜 Git, repo/commit/branch/push/pull/PR, gitGraph, Claude Code로 자연어 Git, GitHub→Vercel 배포 흐름 |
| 09-glossary.html | glossary | 소개 + `<div id="glossary-app"></div>` |
| 10-next.html | next | CC101 장별 링크, 공식 문서, 집에서 하는 1주 연습 루틴 |
