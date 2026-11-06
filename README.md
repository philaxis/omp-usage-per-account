# omp-usage-per-account

[oh-my-pi (omp)](https://github.com/can1357/oh-my-pi)에서 Claude 같은 구독 요금제 사용량을 **계정별로** 보여주는 확장입니다.

omp의 기본 표시는 지금 쓰는 계정 하나만 보여주고, `omp usage`의 `capacity` 줄은 요금제 크기가 달라도 계정마다 사용률을 그냥 더합니다. 이 확장은 계정마다 이메일, 5시간 한도, 1주일 한도를 따로 보여줍니다.

```
Claude 사용량  · Alt+U 접기
▸ me@example.com  (사용 중)
    5시간  ░░░░░░░░░░   4%  3분 후 초기화
    1주일  ░░░░░░░░░░   2%  6일 2시간 후 초기화
  other@example.com
    5시간  ░░░░░░░░░░   0%
    1주일  ██████████  98%  2일 13시간 후 초기화
```

## 동작

- **펼친 상태(기본):** 입력창 위에 계정별 블록을 표시합니다. `▸`는 지금 세션이 쓰는 계정입니다.
- **접은 상태:** 상태줄에 한 줄로 줄입니다. 예: `▸me 5h 4%·7d 2% │ other 5h 0%·7d 98% 2d13h`
- **접기/펼치기:** `Alt+U` 또는 `/usage-fold`. 선택은 `~/.omp/agent/usage-per-account.json`에 저장되어 다음 실행에도 유지됩니다.
- **표시 대상:** 계정이 2개 이상인 제공자는 항상 표시하고, 계정이 1개인 제공자(예: Codex)는 현재 모델이 그 제공자일 때만 표시합니다.
- **색:** 50% 이상 경고 색, 80% 이상 빨간색.
- **갱신:** 세션 시작 시, 5분마다, 작업이 끝날 때마다(최소 1분 간격). omp의 사용량 캐시를 그대로 씁니다.
- 모델별 별도 한도(예: `7 Day (Fable)`)는 표시하지 않습니다.

## 설치

```sh
omp plugin install github:philaxis/omp-usage-per-account
```

접은 상태의 한 줄 표시는 상태줄의 `status` 칸에 나옵니다. 상태줄에 `status`를 넣고, 같은 글자가 상태줄 아래에 한 번 더 나오지 않게 `showHookStatus`를 끕니다. 기본 `usage` 칸은 지금 계정 하나만 보여주므로 `status`로 바꾸는 것을 권장합니다.

```yaml
# ~/.omp/agent/config.yml
statusLine:
  preset: custom
  leftSegments: [model, context_pct, status, time_spent, pr]
  showHookStatus: false
```

## 업데이트 / 제거

```sh
omp plugin upgrade omp-usage-per-account
omp plugin uninstall omp-usage-per-account
```

## 라이선스

MIT
