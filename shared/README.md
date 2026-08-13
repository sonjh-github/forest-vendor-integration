# 공통 계약

업체와 무관하게 공통으로 사용하는 데이터 개념만 관리한다.

- 업체 장비번호 `vendorDeviceId`
- 데이터 발생 장비 `sourceDeviceId`
- 프록시 요청 주체 `reportedByDeviceId`
- 장비 간 링크 `fromDeviceId`, `toDeviceId`, `medium`
- 요청별 프록시 이전 경로 `activePath`
- 실제 수신 관측 `observations`
- 경로 근거 `OBSERVED`, `DECLARED`, `INFERRED`, `UNKNOWN`
- 중복 처리용 `requestId`, `Idempotency-Key`

업체별 필드명과 장비 오류코드는 각 업체 폴더에서 관리한다.

