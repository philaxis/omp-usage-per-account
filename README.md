# omp-usage-per-account

[oh-my-pi (omp)](https://github.com/can1357/oh-my-pi)에서 구독 요금제와 API 잔액을 **계정별로** 한 줄씩 보여주는 확장입니다.

omp의 기본 표시는 지금 쓰는 계정 하나만 보여주고, `omp usage`의 `capacity` 줄은 요금제 크기가 달라도 계정마다 사용률을 그냥 더합니다. 이 확장은 입력창 위에 계정 하나를 한 줄로 보여주고, `Alt+U`로 다음 계정으로 넘깁니다.

```
Claude 사용량  ● 사용 중  me@example.com   5시간 4% (4시간 56분)   1주일 2% (6일 1시간)  1/4 Alt+U
Claude 사용량  ○ 대기  other@example.com   5시간 0%   1주일 98% (2일 12시간)  2/4 Alt+U
ChatGPT 사용량  ○ 대기  me@school.ac.kr   5시간 0% (4시간 58분)   1주일 0% (6일 18시간)  3/4 Alt+U
DeepSeek 사용량  ○ 대기   잔액 $5.35  4/4 Alt+U
```

## 동작

- **표시 대상:** omp가 사용량을 받아오는 구독 계정 전부(Claude, ChatGPT/Codex 등)와, DeepSeek 키가 있으면 DeepSeek 잔액.
- **사용 중 / 대기:** 지금 모델이 쓰는 계정은 `● 사용 중`과 강조색(하늘색)으로 표시하고 맨 앞에 둡니다. 나머지는 `○ 대기`입니다. 쓰는 계정이 바뀌면(예: 한도 초과로 다른 계정이나 폴백 모델로 넘어감) 표시도 그 계정으로 돌아갑니다.
- **넘기기:** `Alt+U` 또는 `/usage-next`.
- **한도:** 5시간·1주일 사용률과 초기화까지 남은 시간. 50% 이상 경고 색, 80% 이상 빨간색. 모델별 별도 한도(예: `7 Day (Fable)`)는 표시하지 않습니다.
- **DeepSeek:** `/user/balance` 잔액. $1 미만 경고 색, 0 이하 또는 사용 불가면 빨간색.
- **갱신:** 세션 시작 시, 5분마다, 작업이 끝날 때마다(최소 1분 간격). 구독 사용량은 omp의 사용량 캐시를 그대로 씁니다.

## 설치

```sh
omp plugin install github:philaxis/omp-usage-per-account
```

설치나 업데이트 후에는 omp를 다시 시작해야 반영됩니다(`omp -c`로 하던 대화를 이어서 열 수 있습니다).

## 업데이트 / 제거

`omp plugin upgrade`는 Git 브랜치의 새 커밋을 다시 받지 않을 수 있습니다. 새 커밋을 받으려면 커밋을 지정해 다시 설치합니다.

```sh
omp plugin install github:philaxis/omp-usage-per-account#<commit>
omp plugin uninstall omp-usage-per-account
```

## 라이선스

MIT
