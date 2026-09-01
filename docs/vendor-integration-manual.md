# 산림청 장비 연동 API 업체 매뉴얼

본 문서는 장비 업체가 자사 장비와 연동 프로그램을 산림청 통합 시스템에 연결하기 위한 공통 규격이다. 업체별 API 구조는 나누지 않으며 모든 업체가 동일한 `/{vendor}` API를 사용한다. 장비마다 다른 실제 데이터는 `data`에 그대로 담는다.

| 항목 | 내용 |
|---|---|
| 문서 버전 | 1.1 |
| 작성일 | 2026-09-01 |
| 대상 | 장비 업체 개발·운영 담당자 |
| 데이터 형식 | UTF-8 JSON |

## 1. 운영 주소

| 용도 | 주소 |
|---|---|
| 장비 등록 화면 | <https://wildfire.forest.tobeunicorn.kr/device> |
| 장비 연동 API | <https://device.forest.tobeunicorn.kr> |
| 요청·응답 로그 | <https://docs.google.com/spreadsheets/d/1-EFs-PZX5w6QbitYZZRa7cpWXpVCXRDy6PFpEkE8umw/edit> |

새 장비는 먼저 [장비 등록 화면](https://wildfire.forest.tobeunicorn.kr/device)에서 등록한다. 업체 프로그램은 Core 서버가 아니라 [장비 연동 API](https://device.forest.tobeunicorn.kr)로 요청하며, 처리 결과는 [요청·응답 로그 시트](https://docs.google.com/spreadsheets/d/1-EFs-PZX5w6QbitYZZRa7cpWXpVCXRDy6PFpEkE8umw/edit)에서 확인한다.

## 2. 공통 API

모든 업체는 같은 API를 사용한다. `{vendor}`에는 발급받은 업체 코드를 소문자로 넣는다.

```http
POST https://device.forest.tobeunicorn.kr/{vendor}/register
POST https://device.forest.tobeunicorn.kr/{vendor}/invoke?mode=VALIDATE_ONLY
POST https://device.forest.tobeunicorn.kr/{vendor}/invoke?mode=DELIVER
GET  https://device.forest.tobeunicorn.kr/{vendor}/health
```

현재 업체 코드 예시는 `ndps`, `jininfra`다. 요청 구조와 처리 방식은 동일하며 업체별 전용 `invoke` 스키마를 사용하지 않는다.

## 3. 최초 연동 순서

1. [장비 등록 화면](https://wildfire.forest.tobeunicorn.kr/device)에 접속한다.
2. 장비 정보, 업체 코드, 업체 장비번호 `vendorDeviceId`, 장비 상태를 입력한다.
3. 저장하면 Core가 물리 장비 UUID인 `assetId`를 발급하고 업체 장비번호와 연결한다.
4. [장비 연동 API](https://device.forest.tobeunicorn.kr)의 `POST /{vendor}/register`를 호출한다.
5. `registrationStatus=MAPPED`를 확인한다.
6. `VALIDATE_ONLY`로 형식과 연결 상태를 시험한 뒤 `DELIVER`로 실제 데이터를 전송한다.
7. [로그 시트](https://docs.google.com/spreadsheets/d/1-EFs-PZX5w6QbitYZZRa7cpWXpVCXRDy6PFpEkE8umw/edit)에서 요청과 응답을 확인한다.

```text
vendor + vendorDeviceId → Core assetId(UUID)
```

- `vendorDeviceId`는 업체가 관리하는 고유 장비번호다.
- 같은 업체 안에서 중복되면 안 되며 장비 교체가 아니라면 변경하지 않는다.
- 업체는 API 요청에 `vendorDeviceId`를 사용하고 서버가 내부에서 `assetId`로 변환한다.
- 요청에 등장하는 모든 장비번호가 등록되어야 `DELIVER`할 수 있다.

## 4. Register

`register`는 [장비 등록 화면](https://wildfire.forest.tobeunicorn.kr/device)에서 생성한 장비와 업체 장비번호의 연결 상태를 확인하고 캐시에 적재한다. 새 물리 장비를 생성하지는 않는다.

```http
POST https://device.forest.tobeunicorn.kr/{vendor}/register
Content-Type: application/json
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `vendor` | string | X | 기존 연동 호환용. 보내는 경우 URL 업체 코드의 대문자 값과 같아야 함 |
| `sourceDeviceId` | string | O | 등록 요청의 기준 장비번호이며 `devices`에 포함 |
| `observedAt` | date-time | O | 등록 상태 확인 시각 |
| `devices` | array | O | 확인할 장비 목록, 최소 1건 |
| `devices[].vendorDeviceId` | string | O | 업체 장비번호 |
| `devices[].deviceType` | string | O | 업체가 사용하는 장비 종류 |
| `devices[].modelName` | string/null | X | 모델명 |
| `devices[].firmwareVersion` | string/null | X | 펌웨어 버전 |
| `devices[].attributes` | object | X | 업체 추가 정보 |

실제 등록 대상은 `devices[]`이며 `sourceDeviceId`는 그중 등록 요청의 기준이 되는 장비다.

```json
{
  "sourceDeviceId": "VENDOR-DEVICE-001",
  "observedAt": "2026-09-01T05:00:00.000Z",
  "devices": [
    { "vendorDeviceId": "VENDOR-GATEWAY-001", "deviceType": "GATEWAY" },
    { "vendorDeviceId": "VENDOR-DEVICE-001", "deviceType": "FIELD_DEVICE" }
  ]
}
```

### 정상 응답

```json
{
  "data": {
    "vendor": "VENDOR_CODE",
    "registrationStatus": "MAPPED",
    "mappedDevices": [{
      "vendorDeviceId": "VENDOR-GATEWAY-001",
      "assetId": "00000000-0000-4000-8000-000000000001",
      "mapped": true,
      "assetExists": true,
      "mappingStatus": "ACTIVE"
    }],
    "unmappedDeviceIds": [],
    "checkedAt": "2026-09-01T05:04:41.625Z"
  }
}
```

| 상태 | HTTP | 처리 |
|---|---:|---|
| `MAPPED` | 200 | 모든 장비 사용 가능 |
| `PARTIALLY_MAPPED` | 207 | 미연결 장비만 등록 화면에서 확인 |
| `UNMAPPED` | 207 | 장비 등록과 업체 장비번호 연결을 다시 확인 |

## 5. Invoke 공통 구조

모든 업체의 구조는 같다. `data` 내용만 장비 종류에 맞게 구성한다.

```json
{
  "payloadType": "VENDOR_DATA_TYPE",
  "context": {},
  "relatedDeviceIds": [],
  "activePath": [],
  "data": {}
}
```

### context

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `eventExternalId` | string | O | 업체 내부 이벤트 고유번호 |
| `sourceSystem` | string | O | 송신 시스템명 |
| `occurredAt` | date-time | O | 이벤트 발생 시각 |
| `sentAt` | date-time/null | X | API 송신 시각 |
| `sourceDeviceId` | string | O | 원 신호를 최초 생성한 장비번호. 서버에서 Core `assetId`로 변환됨 |
| `reportedByDeviceId` | string | X | 기존 연동 호환용 선택 필드 |

### relatedDeviceIds

`context`나 `activePath`에는 없지만 이벤트와 관련되어 UUID 변환이 필요한 장비번호가 있으면 `relatedDeviceIds`에 넣는다. 관련 장비가 없으면 생략하거나 `[]`을 보낸다. 서버는 이 배열의 모든 업체 장비번호도 등록 여부를 확인하고 Core UUID로 변환한다.

### activePath와 observations

`activePath`는 데이터가 서버에 도달하기 전 지나온 실제 장비 통신 경로다. `observations`는 별도 최상위 배열이 아니라 해당 경로 구간 안에 넣는다.

```text
activePath[]                 경로의 한 구간
activePath[].observations[]  그 구간에서 측정된 수신 품질
```

| 경로 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `sequence` | integer | O | 1부터 시작하는 경로 순서 |
| `fromDeviceId` | string | O | 송신 장비번호 |
| `toDeviceId` | string | O | 수신 장비번호 |
| `medium` | string | O | 업체가 사용하는 통신 방식 |
| `evidenceType` | string | O | `OBSERVED`, `DECLARED`, `INFERRED`, `UNKNOWN` |
| `observedAt` | date-time/null | X | 경로 관측 시각 |
| `status` | string | X | `ACTIVE`, `DEGRADED`, `DOWN`, `UNKNOWN` |
| `observations` | array | O | 해당 구간의 측정값. 없으면 `[]` |
| `attributes` | object | X | 경로 추가 정보 |

| 관측 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `receivedAt` | date-time | O | 수신 시각 |
| `channel` | string/null | X | 채널 |
| `slot` | integer/null | X | 슬롯 |
| `rssiDbm` | number/null | X | 수신 신호 세기 |
| `snrDb` | number/null | X | 신호 대 잡음비 |
| `selected` | boolean | X | 실제 선택된 경로인지 여부 |
| `attributes` | object | X | 관측 추가 정보 |

`fromDeviceId`, `toDeviceId`, `medium`은 경로에 한 번만 작성한다. 관측값마다 반복하지 않는다. 최상위 `observations`는 `400`으로 거부된다.

### data

`data`에는 장비가 생성한 실제 업무 데이터만 넣는다. 장비 종류에 따라 필드가 달라도 되며 서버는 원본 구조를 보존한다. 서버가 임의의 `data` 필드명을 장비번호로 추측하지 않으므로 추가 관련 장비는 반드시 `relatedDeviceIds`에 넣는다. 모든 업체에 동일한 `data` 필드 구성을 강제하지 않는다.

### 전체 요청 예제

```http
POST https://device.forest.tobeunicorn.kr/{vendor}/invoke?mode=DELIVER
Content-Type: application/json
Idempotency-Key: 575d7649-6d77-46b6-afb4-26b524c3de75
```

```json
{
  "payloadType": "DEVICE_STATUS",
  "context": {
    "eventExternalId": "VENDOR-EVENT-001",
    "sourceSystem": "vendor-controller",
    "occurredAt": "2026-09-01T05:10:00.000Z",
    "sourceDeviceId": "VENDOR-DEVICE-001"
  },
  "relatedDeviceIds": ["VENDOR-CONTROLLER-001"],
  "activePath": [
    {
      "sequence": 1,
      "fromDeviceId": "VENDOR-DEVICE-001",
      "toDeviceId": "VENDOR-GATEWAY-001",
      "medium": "VENDOR_RADIO",
      "evidenceType": "OBSERVED",
      "status": "ACTIVE",
      "observations": [{
        "receivedAt": "2026-09-01T05:10:00.000Z",
        "channel": "CH-21",
        "rssiDbm": -72,
        "snrDb": 18.4,
        "selected": true
      }]
    },
    {
      "sequence": 2,
      "fromDeviceId": "VENDOR-GATEWAY-001",
      "toDeviceId": "VENDOR-CONTROLLER-001",
      "medium": "ETHERNET",
      "evidenceType": "DECLARED",
      "status": "ACTIVE",
      "observations": []
    }
  ],
  "data": {
    "observedAt": "2026-09-01T05:10:00.000Z",
    "operationalStatus": "ONLINE"
  }
}
```

모든 시각은 타임존을 포함한 ISO 8601 형식으로 보낸다.

## 6. 테스트와 실제 전송

| mode | 로그 시트 | Core DB | 프론트 장비 로그 | 용도 |
|---|---:|---:|---:|---|
| `VALIDATE_ONLY` | O | X | X | 형식과 장비 연결 시험 |
| `DELIVER` | O | O | O | 실제 운영 데이터 전송 |

`VALIDATE_ONLY` 결과는 [로그 시트](https://docs.google.com/spreadsheets/d/1-EFs-PZX5w6QbitYZZRa7cpWXpVCXRDy6PFpEkE8umw/edit)에만 남고 DB와 프론트에는 나타나지 않는다. `DELIVER` 결과는 로그 시트와 Core DB에 저장되며 DB에 저장된 내용만 프론트 장비 로그에 나타난다.

`mode`를 생략하면 `DELIVER`이므로 항상 명시한다. 실제 전송에는 요청마다 새로운 UUID 형식의 `Idempotency-Key`를 넣고, 같은 데이터를 재전송할 때만 이전 키를 그대로 사용한다.

## 7. Invoke 응답

```json
{
  "data": {
    "requestId": "575d7649-6d77-46b6-afb4-26b524c3de75",
    "accepted": true,
    "duplicate": false,
    "mode": "DELIVER",
    "mapping": { "allMapped": true, "mappedDevices": [], "unmappedDeviceIds": [] },
    "normalizedPath": [],
    "persisted": true,
    "recordId": "575d7649-6d77-46b6-afb4-26b524c3de75",
    "processedAt": "2026-09-01T05:10:01.000Z"
  }
}
```

`accepted`는 접수 여부, `duplicate`는 중복 여부, `mapping.allMapped`는 전체 장비 연결 여부다. `persisted=true`인 데이터만 Core DB와 프론트 장비 로그에 나타난다. `VALIDATE_ONLY`의 `recordId`는 `null`이다.

## 8. Health와 로그 확인

```http
GET https://device.forest.tobeunicorn.kr/{vendor}/health
```

정상 기준은 `diagnosticStatus=HEALTHY`, `databaseStatus=REACHABLE`이다. 이 API는 저장된 수신·매핑 상태를 확인하며 업체 장비로 역방향 요청을 보내지 않는다.

모든 `REGISTER`, `VALIDATE_ONLY`, `DELIVER`, `HEALTH` 요청은 [요청·응답 로그 시트](https://docs.google.com/spreadsheets/d/1-EFs-PZX5w6QbitYZZRa7cpWXpVCXRDy6PFpEkE8umw/edit)에서 확인할 수 있다.

| 열 | 내용 |
|---|---|
| A | timestamp |
| B | method |
| C | URL |
| D | resCode |
| E | 구분 |
| F | durationMs |
| G | user-agent |
| H | 요청 BODY |
| I | 응답 BODY |

업체별 식별 가능한 `User-Agent`를 보내면 검색이 쉽다.

## 9. 오류 대응

| HTTP | 의미 | 조치 |
|---:|---|---|
| 400 | 요청 형식 오류 | 응답 메시지의 필드 경로를 수정 |
| 404 | 미등록 장비 포함 | [장비 등록 화면](https://wildfire.forest.tobeunicorn.kr/device)과 `/register` 결과 확인 |
| 409 | 장비번호 연결 또는 멱등성 키 충돌 | 장비 연결과 요청 키 확인 |
| 502, 504 | 처리 실패 또는 시간 초과 | 같은 `Idempotency-Key`로 재시도 |

장애 문의 시 업체 코드, 요청 시각, 요청 URL과 mode, `vendorDeviceId`, `eventExternalId`, `Idempotency-Key`, HTTP 상태, 오류 코드·메시지, `User-Agent`를 전달한다. 문의 전 [로그 시트](https://docs.google.com/spreadsheets/d/1-EFs-PZX5w6QbitYZZRa7cpWXpVCXRDy6PFpEkE8umw/edit)에서 해당 요청을 먼저 확인한다.

기계 판독용 전체 규격은 저장소의 `api.yaml`을 참고한다.
