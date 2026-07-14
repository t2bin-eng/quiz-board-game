# Quiz Board Game

80칸 한국사 역사 탐험 교육용 보드게임 웹앱입니다.

- Live: https://quiz-board-game.vercel.app
- Firebase project: `fifth-glazing-501306-f5`
- 6자리 입장 코드와 Firestore 실시간 게임 상태 동기화
- XLSX 100문제 문제은행: 공개 문제/비공개 정답 분리 저장

## 배포 구성

- Frontend: Vercel 정적 배포
- Database/Auth: Firebase Authentication + Cloud Firestore
- Source: GitHub 공개 저장소
- Teacher account: `t2bin@uryeo-h.gne.go.kr`
- Student access: 교사가 발급한 입장 코드

`config.js`에는 브라우저 공개용 Firebase 웹앱 구성값만 둡니다. 서비스 계정 키와 교사 비밀번호는 저장소나 브라우저 코드에 넣지 않습니다.
