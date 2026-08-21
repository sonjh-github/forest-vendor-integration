# 장비 연동 서버

NDPS·진인프라 장비 요청을 받는 Hono 서버다. 이 서버는 DB에 직접 접근하지 않는다.

```text
현장 장비 → vendors → 매핑 캐시
                       ├─ HIT: 캐시 사용
                       └─ MISS: core 내부 API 조회 후 캐시 저장
                    → core 내부 API로 메시지 전달
```

## 공개 API

```text
POST /{vendor}/register  장비 UUID 매핑 확인 및 캐시 적재
POST /{vendor}/invoke?mode=VALIDATE_ONLY|DELIVER
GET  /{vendor}/health
```

지원 vendor는 `ndps`, `jininfra`다. 공개 계약은 `api.yaml`을 기준으로 한다.

## 캐시 정책

- UUID가 매핑된 장비: 기본 5분
- 미매핑 장비(negative cache): 기본 30초
- 캐시는 프로세스 메모리에 있으며 재시작하면 비워진다.
- register는 장비 매핑만 확인하며 토폴로지를 저장하지 않는다.
- 수신 메시지는 항상 본 서버로 한 번만 전달한다.

## 환경변수

`.env.example`을 `.env`로 복사해 설정한다. Supabase URL이나 secret key는 이 서버에 설정하지 않는다.

## 실행 및 검증

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

본 서버를 먼저 실행해야 등록·전송·health API가 동작한다. 본 서버가 응답하지 않으면 `502`, 제한 시간을 넘으면 `504`를 반환한다.

운영 Docker 배포에서는 두 컨테이너를 `forest-backend` 네트워크에 연결하고 `CORE_SERVER_URL=http://forest-core-server:18020`으로 설정한다. `main` push 시 배포 워크플로가 테스트와 이미지 빌드 후 EC2에 반영한다.
