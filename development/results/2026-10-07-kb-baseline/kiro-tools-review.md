# KB 비교 도구/증거 리뷰 (읽기 전용)

범위: development/tools/render-kb-baseline.py, kb-comparison.html, development/results/2026-10-07-kb-baseline/{baseline.json, render-proof.json, roundtrip-proof.json}. 테스트/빌드/렌더는 재실행하지 않았다. XML/SVG/셀 값은 출력하지 않았고, 해시·치수·개수만 조회했다. graph는 아키텍처 개요만 호출(신규 도구는 그래프에 없음).

## 직접 확인하여 문제없는 것
- 출처 해시: render-proof 36건의 `sourceSha256` = baseline.json의 `outputSha256`, 디스크의 XML/SVG 해시와도 전부 일치. roundtrip 2건의 `sourceSha256`은 manifest 입력 hash와 같고 export 해시도 디스크와 일치한다.
- 공통 배율: 36개 SVG 모두 `width/height`가 `viewBox`와 같아(불일치 0) 같은 배율에서 1 도면 단위 = 1 CSS px가 된다. 두 패널에 같은 zoom 값을 쓰는 방식은 맞다.
- 고객 데이터: baseline.json, render-proof.json, roundtrip-proof.json에는 비ASCII 문자와 IP 패턴이 없다. `git ls-files`에 `private.local` 경로 0건, `.gitignore`의 `*.local`로 무시됨을 확인했다.
- 페이지 추출/파일 전체 구분: 렌더 범위 문구(활성 페이지만), 뷰어 scope 문구, 보존된 페이지 수 표시가 일관된다.

## 실제 결함

### 1. 렌더 증거의 출처 연결이 강제되지 않고 핵심 버전 정보가 기록되지 않는다 (중간; 현재 데이터는 일치)
- 위치: development/tools/render-kb-baseline.py:21-22(sources 수집), :100-110(proof 기록), :119-124(최종 sourceSha256 목록).
- 근거: 스크립트는 baseline.json의 `outputSha256`과 디스크 XML 해시를 비교하지 않는다. `sourceSha256`은 브라우저가 가져간 뒤에 디스크에서 다시 읽은 값일 뿐이라, XML이 baseline 산출 후 바뀌어도 "검증됨"으로 기록된다(지금은 36건 모두 일치함을 내가 따로 확인). 또 proof에는 baseline.json 자체의 해시·codeSha가 없고, sourceSha256 목록은 렌더 도구와 probe만 담는다. roundtrip 판정에 실제로 쓰인 `/scripts/layout-metrics.js`(브라우저에서 import)와 변동 가능한 원격 `embed.diagrams.net`의 draw.io 버전도 기록되지 않는다. 같은 입력으로 나중에 재현하면 다른 export가 나와도 비교할 기준이 없다.
- 수정: 렌더 전에 각 소스의 해시를 baseline 기록의 `outputSha256`과(전체 원본은 manifest hash와) 대조해 불일치 시 중단한다. render-proof에 baseline.json 해시, layout-metrics.js 해시, 가능하면 draw.io 버전을 추가한다.

### 2. 뷰어의 `hidden` 처리가 CSS에 덮여 측정 불가/무효 출력에서 이전 상태가 남는다 (낮음~중간; 현재 데이터에는 해당 사례 없음)
- 위치: development/tools/kb-comparison.html:13(`img{display:block;...}`), :54-56(`image.hidden = ...; removeAttribute('src')`).
- 근거: 작성자 CSS의 `display:block`이 브라우저 기본 `[hidden]{display:none}`보다 우선하므로 `hidden`이 적용되지 않는다. 출력 무효/제품 변환 실패 행에서는 src만 제거된 빈 이미지가 alt 문구("선택한 KB 사례 변환 결과")와 함께 남고, 이전에 설정된 `image.width`도 그대로다. 정상 이미지처럼 보이는 자리에 alt가 보여 "렌더링 없음"이 명확하지 않다. 현재 36건이 모두 `measured`라 지금은 재현되지 않으며, 코드와 CSS 규칙으로만 확인했다(브라우저 미실행).
- 수정: `img[hidden]{display:none}`를 추가하거나 `hidden` 대신 클래스 토글을 쓴다.

## 그 밖
- 결함 2건만 보고한다. 배율·고객 데이터·범위 구분에서 추가로 재현된 오류는 없다.

KB_TOOLS_REVIEW_DONE
