# 업체 통신 연동 설계

이 폴더는 NDPS·진인프라의 현장 장비가 프록시 서버에 도달하기 전까지 거치는
장비와 통신 링크를 등록·보고하기 위한 인터페이스 설계 공간이다.

## 공개 API

업체별 공개 경로는 세 종류만 유지한다.

```text
POST /{vendor}/register  장비 목록·링크 등록 및 UUID 매핑 확인
POST /{vendor}/invoke    장비 데이터·프록시 이전 통신 경로 보고
GET  /{vendor}/health    투비 서버의 업체 데이터 수신·저장 상태 조회
```

상세 요청·응답 계약은 `api.yaml`을 기준으로 한다. 보안·인증 규격은 이 문서군에 포함하지 않는다.

UUID는 프록시에서 생성하지 않는다. 업체 `vendorDeviceId`를 `core.vendor_device_mapping`에서 조회하고,
최초 매핑 후보도 기존 `core.asset.asset_code` 또는 `core.asset.serial_number`와 일치하는 경우에만 연결한다.
기존 자산 UUID가 없는 장비는 `UNMAPPED`로 반환하며 `invoke?mode=DELIVER` 데이터를 저장하지 않는다.

TOBE가 관리하는 독립 서비스는 업체 공개 경로와 분리한다.

```text
GET /tobe/health       투비 프록시·DB 연결 상태 진단
```

## 실행

Hono·TypeScript·Supabase package 기반의 독립 프록시 서버다.

```bash
npm install
npm run dev
```

기본 주소는 `http://127.0.0.1:18010`이다. `.env.example`을 참고해 `.env`에 Supabase 서버 키를 설정한다.

### 1. 환경변수 설정

프로젝트 루트에 `.env`를 만들고 다음 값을 설정한다. `SUPABASE_SECRET_KEY`는 브라우저나 업체 장비에
배포하지 않고 투비 서버에서만 사용한다.

```dotenv
HOST=0.0.0.0
PORT=18010
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
SUPABASE_HEALTH_SCHEMA=core
SUPABASE_HEALTH_TABLE=disaster_event
```

- 같은 PC에서만 시험할 때는 `HOST=127.0.0.1`을 사용한다.
- 같은 공유기의 업체 장비에서 접근할 때는 `HOST=0.0.0.0`으로 실행하고, 요청 주소에는 서버 PC의 실제 IP를 사용한다.
- Windows PowerShell의 실행 정책으로 `npm`이 차단되면 `npm.cmd`를 사용한다.

```powershell
npm.cmd install
npm.cmd run dev
```

서버 확인:

```bash
curl http://127.0.0.1:18010/
curl http://127.0.0.1:18010/tobe/health
```

### 2. 연동 순서

업체 연동은 다음 순서를 따른다.

1. 투비가 `core.asset`에 장비를 먼저 등록하고 UUID를 확보한다.
2. 업체가 `/register`로 업체 장비번호와 통신 구성을 보낸다.
3. 응답의 `registrationStatus`와 `unmappedDeviceIds`를 확인한다.
4. `/invoke?mode=VALIDATE_ONLY`로 JSON 형식과 UUID 매핑만 시험한다.
5. 검증 완료 후 `/invoke?mode=DELIVER`로 운영 데이터를 저장한다.
6. `/health`에서 해당 업체의 최근 수신·저장 상태를 확인한다.

코드의 핵심 호출 흐름은 다음과 같다.

```text
NDPS 또는 진인프라 요청
→ 업체별 routes.ts에서 JSON 계약 검증
→ 업체별 integration.ts에서 lookupTobeDevices() 호출
→ 투비 서버가 Supabase core.asset / vendor_device_mapping 조회
→ 기존 UUID 매핑 결과 반환 (UUID 신규 생성 금지)
→ 전부 매핑되면 topology 또는 invoke 데이터 저장
→ 미매핑 장비가 있으면 207 또는 404로 업체에 반환
```

업체 코드가 Supabase 클라이언트를 직접 사용하지는 않는다. NDPS와 진인프라는 투비가 공개한
`lookupTobeDevices()` 함수를 호출하고, 실제 DB 테이블·키·조회 방식은 `src/tobe`에서만 관리한다.
따라서 DB 스키마가 바뀌어도 업체별 패킷 변환 코드에는 영향을 최소화할 수 있다.

`vendorDeviceId`는 `core.asset.asset_code` 또는 `core.asset.serial_number`와 일치해야 최초 매핑할 수 있다.
서버는 자산 UUID를 새로 만들지 않는다.

### 3. NDPS 사용 예시

장비와 고정 통신 구성을 등록한다.

```bash
curl -X POST http://127.0.0.1:18010/ndps/register \
  -H "Content-Type: application/json" \
  -d '{
    "vendor":"NDPS",
    "reportedByDeviceId":"NDPS-NMS-01",
    "observedAt":"2026-08-13T09:00:00+09:00",
    "devices":[
      {"vendorDeviceId":"NDPS-NMS-01","deviceType":"TVWS_NMS","connectedTo":null},
      {"vendorDeviceId":"TVWS-BASE-01","deviceType":"TVWS_BASE","connectedTo":{"vendorDeviceId":"NDPS-NMS-01","medium":"ETHERNET","evidenceType":"DECLARED"}},
      {"vendorDeviceId":"TVWS-CPE-01","deviceType":"TVWS_CPE","connectedTo":{"vendorDeviceId":"TVWS-BASE-01","medium":"TVWS","evidenceType":"DECLARED"}}
    ]
  }'
```

TVWS 상태와 실제 관측 경로를 검증하거나 저장한다.

```bash
curl -X POST "http://127.0.0.1:18010/ndps/invoke?mode=VALIDATE_ONLY" \
  -H "Content-Type: application/json" \
  -d '{
    "context":{
      "eventExternalId":"FIRE-2026-001",
      "sourceSystem":"NDPS-NMS",
      "occurredAt":"2026-08-13T09:01:00+09:00",
      "sourceDeviceId":"TVWS-CPE-01",
      "reportedByDeviceId":"NDPS-NMS-01"
    },
    "activePath":[
      {"sequence":1,"fromDeviceId":"TVWS-CPE-01","toDeviceId":"TVWS-BASE-01","medium":"TVWS","evidenceType":"OBSERVED"}
    ],
    "data":{
      "baseDeviceId":"TVWS-BASE-01",
      "cpeDeviceId":"TVWS-CPE-01",
      "observedAt":"2026-08-13T09:01:00+09:00",
      "operationalStatus":"ONLINE"
    }
  }'
```

### 4. 진인프라 사용 예시

RTK·LPWA 구성을 등록한 뒤 게이트웨이 데이터를 전송한다.

```bash
curl -X POST http://127.0.0.1:18010/jininfra/register \
  -H "Content-Type: application/json" \
  -d '{
    "vendor":"JININFRA",
    "reportedByDeviceId":"RTK-GW-01",
    "observedAt":"2026-08-13T09:00:00+09:00",
    "devices":[
      {"vendorDeviceId":"RTK-GW-01","deviceType":"RTK_LPWA_GATEWAY","connectedTo":null},
      {"vendorDeviceId":"RTK-TERM-01","deviceType":"RTK_TERMINAL","connectedTo":{"vendorDeviceId":"RTK-GW-01","medium":"LPWA","evidenceType":"DECLARED"}}
    ]
  }'
```

```bash
curl -X POST "http://127.0.0.1:18010/jininfra/invoke?mode=DELIVER" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-4111-8111-111111111111" \
  -d '{
    "payloadType":"RTK_LPWA_GATEWAY",
    "context":{
      "eventExternalId":"FIRE-2026-001",
      "sourceSystem":"JININFRA-GATEWAY",
      "occurredAt":"2026-08-13T09:01:00+09:00",
      "sourceDeviceId":"RTK-GW-01",
      "reportedByDeviceId":"RTK-GW-01"
    },
    "activePath":[],
    "data":{
      "gatewayDeviceId":"RTK-GW-01",
      "observedAt":"2026-08-13T09:01:00+09:00",
      "operationalStatus":"ONLINE",
      "rtcmAvailable":true,
      "connectedTerminals":1,
      "receivedTerminalDeviceIds":["RTK-TERM-01"]
    }
  }'
```

`Idempotency-Key`에는 요청마다 UUID를 넣는다. 동일 키를 재전송하면 중복 저장하지 않고 기존 처리 결과를 반환한다.

### 5. 상태 및 응답 확인

```bash
curl http://127.0.0.1:18010/ndps/health
curl http://127.0.0.1:18010/jininfra/health
curl http://127.0.0.1:18010/tobe/health
```

- `200`: 전체 UUID 매핑 또는 정상 검증·저장
- `207`: 일부 장비만 UUID에 매핑됨
- `400`: JSON 형식이나 필수 필드 오류
- `404 UNMAPPED_DEVICES`: 기존 자산 UUID에 연결되지 않은 장비 포함
- `409`: 매핑 또는 멱등성 키 충돌
- `502`: Supabase 등 내부 처리 실패
- `504`: 처리 시간 초과

`health`는 장비로 ping이나 HTTP 요청을 보내는 기능이 아니다. 투비 서버가 실제로 받은 최근 메시지와
Supabase 저장 상태를 보여준다.

### 6. 개발 검증

업체 하나만 단위 테스트할 수 있다. 이 테스트는 Supabase에 연결하지 않는다.

```bash
npm run test:ndps
npm run test:jininfra
```

실제 `.env`의 Supabase까지 연결하는 업체별 연동 테스트:

```bash
npm run test:integration:ndps
npm run test:integration:jininfra
npm run test:integration:tobe-db
```

전체 테스트를 한 번에 실행할 수도 있다.

```bash
npm run typecheck
npm test
npm run build
npm run test:integration
```

- `test/ndps.test.ts`: NDPS 등록·3단계 상태·품질지표·백홀·오류 시나리오 전체
- `test/jininfra.test.ts`: 진인프라 등록·게이트웨이·단말 위치·긴급상태·RTCM·오류 시나리오 전체
- `test/tobe.test.ts`: 투비 DB 연결·UUID 매핑·UUID 비생성·저장·health 전체
- `scripts/ndps-integration.ts`: NDPS 매핑/미매핑 등록→검증→저장→중복방지→오류응답→health
- `scripts/jininfra-integration.ts`: 진인프라 매핑/미매핑 등록→검증→저장→중복방지→오류응답→health

연동 테스트의 `SIM-*` 장비번호는 Supabase `core.asset.asset_code` 또는 `serial_number`에 사전 등록되어
있어야 한다. 없으면 테스트가 `UNMAPPED_DEVICES`로 실패하며, 테스트 코드가 임의 UUID를 만들지는 않는다.

### 7. 업체별 시나리오 범위

| 구분 | 정상 시나리오 | 장애·거부 시나리오 | DB 확인 |
|---|---|---|---|
| NDPS | TVWS 구성 등록, 3단계 장비상태, 검증전용, 저장, 재전송 | 타 업체 장비·LPWA·미등록 링크·누락 필드·미매핑·잘못된 mode | 기존 UUID 일치, 메시지 저장, 중복 미저장 |
| 진인프라 | RTK/LPWA 구성, 게이트웨이 3단계 상태, 단말 위치 6조합, 검증전용, 저장 | TVWS·잘못된 payloadType·GeoJSON·미매핑·잘못된 mode | 기존 UUID 일치, 메시지 저장, 중복 미저장 |
| 투비 DB | Supabase 연결, 필수 테이블, UUID 조회, 수신상태 | 미등록 장비 UUID/매핑 자동생성 금지 | 최근 저장 상태와 업체별 health 조회 |

업체별 테스트 파일은 하나씩만 유지한다. 파일을 직접 실행하려면 다음과 같이 지정한다.

```bash
node --import tsx --test test/ndps.test.ts
node --import tsx --test test/jininfra.test.ts
node --env-file=.env --import tsx test/tobe.test.ts
```

PowerShell에서는 모든 명령의 `npm`을 `npm.cmd`로 바꿔 실행할 수 있다.

테스트 코드의 임시 장비번호·시각·좌표·품질 수치는 파일 상단 fixture 변수로 분리되어 있다.
해당 값을 사용하는 테스트 이름에는 `(임시 값)`을 표시했으며, 실제 업체 데이터 스펙을 받으면 fixture만 교체한다.

## 책임 구분

```text
현장 장비
→ LPWA·TVWS 등 현장망
→ 게이트웨이·Base·CPE
→ Ethernet
→ 백홀·업체 NMS·제어기
→ TOBE 프록시
```

업체는 프록시 이전 구간만 보고한다. 프록시 이후 내부 백엔드 라우팅은 업체 공개 계약에 포함하지 않는다.

`health`는 최근 수신 메시지, UUID 매핑, DB 저장 상태만 조회한다. 문서에서 업체 장비가 제공하는
역방향 점검 인터페이스가 확인되지 않았으므로 프록시가 NDPS·진인프라 장비로 요청을 보내지 않는다.
장비별 능동 점검은 업체 규격이 확정된 뒤 해당 업체 폴더에 추가한다.

## 폴더

```text
vendors/
├─ api.yaml          업체 공개 OpenAPI 계약
├─ src/ndps/         NDPS 계약 검증과 공개 라우트
├─ src/jininfra/     진인프라 계약 검증과 공개 라우트
├─ src/tobe/         Supabase·UUID 매핑·저장·수신 상태 판정
├─ src/shared/       업체 공통 데이터형과 HTTP 오류 처리
├─ test/             업체 계약 단위 테스트
└─ shared/                  공통 장비·링크·경로 계약과 시험 기준
```

각 업체 폴더의 `contract.ts`, `integration.ts`, `routes.ts`는 상대 업체 코드를 import하지 않는다.
업체별 장비 유형·통신방식·페이로드 검증도 서로 분리되어 한 업체 규격 변경이 다른 업체에 전파되지 않는다.
두 업체가 함께 사용하는 부분은 투비 소유의 DB 저장·UUID 매핑과 순수 공통 데이터형뿐이다.

## 경로 증거 수준

- `OBSERVED`: 업체 NMS·게이트웨이가 실제 수신 사실을 확인
- `DECLARED`: 업체가 등록한 고정 통신 구성
- `INFERRED`: 확인된 구성으로 추론
- `UNKNOWN`: 확인할 수 없음

LPWA의 물리적 전파 경로를 자동 추적한다고 표현하지 않는다. 게이트웨이 또는 네트워크 제어기가
확인한 단말·수신 게이트웨이·채널·슬롯·RSSI/SNR을 논리 경로의 근거로 사용한다.
