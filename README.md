# 시크릿 히틀러 (친구용 웹판)

보드게임 [Secret Hitler](https://www.secrethitler.com/) 규칙을 그대로 옮긴 실시간 웹게임입니다. 웹에서는 보드·비밀 카드·투표만 처리하고, 토론은 디스코드 통화로 하세요.

5~10명이 방 코드로 참가합니다. 서버가 역할을 숨기고 규칙을 판정합니다.

## 로컬에서 실행

Node.js 18 이상이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다. 친구와 같은 Wi-Fi가 아니면 배포가 필요합니다.

프로덕션 빌드:

```bash
npm run build
npm start
```

기본 포트는 `3001`입니다. `PORT` 환경 변수로 바꿀 수 있습니다.

## Railway에 올리기

이 프로젝트는 Railway용으로 맞춰 두었습니다. (`railway.toml`, 빌드 `npm run build`, 시작 `npm start`)

1. [Git](https://git-scm.com/download/win) 설치 후 터미널을 다시 엽니다.
2. [GitHub](https://github.com/signup) 계정을 만들고, [새 저장소](https://github.com/new)를 만듭니다. (Public이든 Private이든 됩니다.)
3. 이 폴더에서:

```bash
git init
git add .
git commit -m "Secret Hitler web game"
git branch -M main
git remote add origin https://github.com/본인아이디/저장소이름.git
git push -u origin main
```

4. [Railway](https://railway.app)에 GitHub로 로그인합니다.
5. **New Project** → **Deploy from GitHub repo** → 방금 올린 저장소 선택
6. 배포가 끝나면 **Settings → Networking → Generate Domain**
7. 나온 `https://xxxx.up.railway.app` 주소를 친구에게 보냅니다.

한 명이 방 만들기 → 6자리 코드를 디스코드에 올리기 → 나머지 참가하기.

서버가 재시작되면 진행 중이던 방은 사라집니다.

## 라이선스

Secret Hitler by Mike Boxleiter, Tommy Maranges, and Mac Schubert.
CC BY-NC-SA 4.0 — 비영리, 저작자 표기, 동일 라이선스 공유.
공식 사이트: https://www.secrethitler.com/

이 저장소의 코드도 같은 라이선스를 따릅니다. 공식 일러스트는 포함하지 않았습니다.
