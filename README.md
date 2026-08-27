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
- register는 Core의 `vendor + vendorDeviceId` 매핑을 확인하고 캐시에 적재한다.
- 매핑이 없으면 현재 Core는 기존 업체 호환을 위해 `asset_code = vendorDeviceId`인 기존 자산을 찾아 매핑할 수 있다.
- register는 신규 자산이나 UUID를 생성하지 않는다.
- 미연결 장비는 `UNMAPPED`로 반환한다.
- 토폴로지는 저장하지 않는다.
- 수신 메시지는 항상 본 서버로 한 번만 전달한다.

## 요청 로그 확인

일반 요청의 요청·응답 로그는 처리 응답과 분리된 비동기 큐를 통해 [장비 요청 로그 Google Sheet](https://docs.google.com/spreadsheets/d/1-EFs-PZX5w6QbitYZZRa7cpWXpVCXRDy6PFpEkE8umw/edit?usp=sharing)에 적재한다.

```text
timestamp | method | url | status | 구분 | durationMs | user-agent | request.body | response.body
```

- 테스트 요청은 고유한 `User-Agent`를 지정하면 시트에서 쉽게 검색할 수 있다.
- `구분`은 `REGISTER`, `VALIDATE_ONLY`, `DELIVER`, `HEALTH`, `OTHER` 중 하나이며 E열에 기록된다.
- Docker 전용 `GET /` 헬스체크는 기록하지 않으며 일반 사용자의 `GET /` 요청은 기록한다.
- 날짜별 로그 파일은 생성하지 않는다.
- 외부 시트 전송이 실패하거나 제한 시간을 초과해도 장비 API 응답에는 영향을 주지 않는다.
- 서버의 실시간 stdout 로그는 `docker logs --tail 100 forest-vendor-integration`으로 확인한다.

## 환경변수

`.env` 없이 실행하면 배포된 본 서버 `https://api.forest.tobeunicorn.kr`에 연결한다. 로컬 Core나 Docker 내부 Core를 사용할 때만 `CORE_SERVER_URL`을 재정의한다. Supabase URL이나 secret key는 이 서버에 설정하지 않는다.

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
