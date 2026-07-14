# Quiz Board Game

80칸 한국사 역사 탐험 교육용 보드게임 웹앱입니다.

## 배포 구성

- Frontend: Vercel 정적 배포
- Database/Auth: Firebase Authentication + Cloud Firestore
- Source: GitHub 공개 저장소
- Teacher account: `t2bin@uryeo-h.gne.go.kr`
- Student access: 교사가 발급한 입장 코드

`config.js`에는 브라우저 공개용 Firebase 웹앱 구성값만 둡니다. 서비스 계정 키와 교사 비밀번호는 저장소나 브라우저 코드에 넣지 않습니다.
