# AI 빌더 기초 레퍼런스

Claude Code를 처음 써 보는 AI 부트캠프 수강생을 위한 한 페이지 보충 학습 자료예요.
개념 설명, 프롬프트, 명령어 표(검색·필터), 에이전트, GitHub와 배포, 용어집이 한 페이지에 들어 있어요.
공식 문서와 CC101 링크를 곁들이고, 백엔드와 분석 도구는 없어요 (정적 페이지, 비용 0원).

## 폴더 구조

```
src/shell.html          페이지 틀 ({{TOC}} {{SECTIONS}} {{DATA}} {{BUILD_DATE}})
src/sections/NN-*.html  섹션 조각 (파일 이름 순서대로 합쳐져요)
src/data/*.json         commands.json, glossary.json
docs/style.css, app.js  스타일과 동작 (GitHub Pages가 그대로 서빙)
docs/index.html         빌드 결과 (직접 고치지 마세요)
scripts/build.py        조각을 합쳐 docs/index.html 생성
scripts/check.py        헤드리스 브라우저로 렌더 점검
CONTRACT.md             섹션 작성 규칙
```

## 빌드

```bash
python3 scripts/build.py            # docs/index.html 생성, 경고는 터미널에 표시
python3 scripts/build.py --strict   # 경고도 실패로 처리
```

파이썬 표준 라이브러리만 써요. JSON이 깨졌거나 섹션 구조가 어긋나면 에러로 멈춰요.

## 점검

```bash
python3 scripts/check.py
```

Mermaid 다이어그램 렌더 수, 에러 박스, 콘솔 에러, 375px와 1280px 가로 넘침, 명령어 표와 용어집 렌더, 검색, 모바일 목차를 확인해요.
스크린샷은 `.check/`에 저장돼요 (git에는 안 올라가요). Playwright(파이썬)가 필요하고, Mermaid를 CDN에서 받으니 인터넷이 켜져 있어야 해요.
브라우저를 못 찾으면 종료 코드 2로 끝나요.

## 배포

GitHub 저장소의 Settings > Pages에서 Branch를 `main`, 폴더를 `/docs`로 고르면 돼요.
`docs/.nojekyll`이 함께 만들어져요.

## 참고

- `research/doc-*.md`는 공식 문서 원문 복사본이라 로컬에만 두고 git에는 올리지 않아요.
- 사용하는 외부 리소스: Pretendard 폰트와 Mermaid 11.4.1 (둘 다 cdn.jsdelivr.net).
