# omp-usage-per-account

An [oh-my-pi (omp)](https://github.com/can1357/oh-my-pi) extension that shows subscription usage and API balance **per account**, one compact line at a time.

omp's built-in footer shows only the account in use, and the `capacity` line of `omp usage` simply adds up each account's used fraction even when the plans differ in size. This extension puts one account on a single line above the editor; `Alt+U` steps to the next one.

```
 Claude me@example.com        │ 5h   4% 4h56m │ 1w   2% 6d1h  │ 1/4   <- in use: inverted accent label
 Claude other@example.com     │ 5h   0%       │ 1w  98% 2d12h │ 2/4
 ChatGPT me@school.ac.kr      │ 5h   0% 4h58m │ 1w   0% 6d18h │ 3/4
 DeepSeek                     │ $5.35 left                    │ 4/4
```

Every account is padded to the same label width, so `5h`, `1w` and the counter stay in the same columns while rotating.

## Behavior

- **Accounts:** every subscription account omp reports usage for (Claude, ChatGPT/Codex, ...), plus the DeepSeek balance when a DeepSeek key is configured.
- **Account in use:** its label is drawn inverted in the accent colour and it comes first. When the session moves to another account or a fallback model, the line follows it.
- **Next account:** `Alt+U` or `/usage-next`.
- **Limits:** `5h` and `1w` used percentage, then the time until that window resets. Yellow from 50%, red from 80%. Per-model meters such as `7 Day (Fable)` are not shown.
- **DeepSeek:** balance from `/user/balance`. Yellow below $1, red at zero or when unavailable.
- **Refresh:** at session start, every 5 minutes, and after each agent run (at most once a minute). Subscription usage comes from omp's own usage cache.

## Install

```sh
omp plugin install github:philaxis/omp-usage-per-account
```

Restart omp after installing or updating (`omp -c` reopens the last conversation).

## Update / remove

`omp plugin upgrade` may not pick up new commits on a Git branch. Reinstall with an explicit commit instead:

```sh
omp plugin install github:philaxis/omp-usage-per-account#<commit>
omp plugin uninstall omp-usage-per-account
```

## License

MIT
