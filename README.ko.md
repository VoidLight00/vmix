[English](README.md) | [한국어](README.ko.md)

# vmix

Claude Code 하나로 GPT와 Gemini를 오가며 쓰는 실행기예요. 모델 목록은 파일 하나에서만 관리하고, 고르지 않은 모델이 몰래 대신 답하는 일은 라우터가 막아요.

![vmix hero](assets/hero.png)

`vmix`는 [Claude Code](https://github.com/anthropics/claude-code)를 [claude-code-router](https://github.com/musistudio/claude-code-router)(CCR)에 연결해서 실행해요. CCR은 요청을 [VibeProxy](https://github.com/automazeio/vibeproxy)로 넘기는데, VibeProxy는 이미 쓰고 계신 ChatGPT·Gemini 구독으로 로그인해 주는 macOS 메뉴바 앱이에요. 세션 안에서 `/model`로 GPT-6와 Gemini를 바꿔도 대화는 그대로 이어져요.

이 저장소는 튜토리얼이기도 해요. 빈 맥에서 시작해 `vmix`가 돌아가기까지 필요한 앱을 순서대로 설치하고, 만들면서 겪은 실수도 함께 정리했어요.

## 왜 만들었나요

시작은 질문 하나였어요. “Gemini 세션에서 `/model`로 Opus를 골랐더니 잘 되네요. 예전엔 안 되지 않았나요?”

사실은 안 되고 있었어요. 화면에는 Opus라고 떠 있었지만 답은 GPT가 하고 있었어요. 라우터에 Claude 모델 경로가 없으니, 아무 말 없이 기본 모델로 넘겨 버린 거예요. 멀쩡해 보이는 구성 안에 문제가 두 개 숨어 있었어요.

1. **화면에 보이는 모델과 실제로 답하는 모델이 다를 수 있어요.** 모르는 모델을 기본 모델로 넘기는 라우터는 오타, 사라진 모델, 지원하지 않는 선택을 전부 조용한 대체로 바꿔 버려요.
2. **모델 목록이 다섯 군데에 흩어져 있었어요.** 셸 함수, 실행 스크립트, 라우터, 라우터 설정, 프록시가 각자 목록을 들고 있어서 모델 하나를 추가하려면 전부 고쳐야 했고, 결국 서로 어긋났어요.

`vmix`는 두 문제를 같이 풀어요. 레지스트리 파일 하나가 모든 곳에 목록을 공급하고, 레지스트리에 없는 모델은 눈에 보이는 오류로 끝나요.

## 무엇을 할 수 있나요

- `vmix`, `vmix gemini`, `vmix luna`처럼 레지스트리의 모델이나 별칭으로 바로 세션을 시작해요.
- 세션 안의 `/model` 슬롯도 레지스트리에서 정해져요. 예제 설정에서는 Opus = GPT-6 Sol, Sonnet = Gemini 3.8, Haiku = GPT-6 Luna, custom = GPT-6 Astra예요.
- **실패하면 멈추는(fail-closed) 라우터**를 써요. Claude 모델, 모르는 모델, 꺼 둔 모델은 기본 모델이 대신 답하지 않고 HTTP 400으로 끝나요.
- `vmix sync`가 레지스트리를 CCR 설정에 옮겨 적어서 목록이 어긋날 수 없어요.
- `vmix doctor`가 레지스트리, 라우터 연결, 프록시 모델 목록, CCR 상태를 한 번에 점검해요.
- `vmix smoke`가 모델마다 아주 작은 요청을 보내서 **실제로 어떤 모델이 답했는지** 확인해요.
- 노트북은 가볍게 유지해요. 무거운 프록시는 항상 켜져 있는 다른 기기에서 돌리고, 노트북에서는 작은 Node 프로세스 두 개만 돌아가요.

## 한눈에 보기

| 레지스트리 하나가 전부에 공급 | 세션 중에 모델 전환 | 대신 답하지 않고 거절 |
|---|---|---|
| ![레지스트리 하나](assets/gallery-1.png) | ![모델 전환](assets/gallery-2.png) | ![실패하면 멈추는 라우터](assets/gallery-3.png) |

## 전체 구조

![architecture](assets/architecture.png)

```text
 노트북 (클라이언트)                               프록시 호스트 (항상 켜진 맥, 또는 같은 노트북)
 ───────────────────                               ─────────────────────────────────────────────
 vmix ──► Claude Code ──► CCR :3456 ──────────────► VibeProxy :8317 ──► ChatGPT / Gemini (본인 OAuth 로그인)
            │               │                    ▲
            │               └─ custom-router.js ─┘   요청마다 ~/.config/vmix/models.json 을 읽음
            └─ /model 슬롯  ◄── ~/.config/vmix/models.json (레지스트리: id, 별칭, provider, 컨텍스트 캡)
```

- 직접 고치는 파일은 **레지스트리** 하나뿐이에요. 실행기, 라우터, `vmix sync`가 모두 이 파일을 읽어요.
- **라우터**는 레지스트리에 있는 모델이면 `provider,model`을 돌려주고, 나머지는 전부 `vibeproxy,__vmix_unsupported__<모델>`로 보내요. 프록시가 이 요청을 400으로 거절해요.
- 선택 구성요소인 [solgate](https://github.com/VoidLight00/solgate)를 설치하면 오래된 대화를 요약해 주는 GPT “가상 1M” 프로필을 쓸 수 있어요. 설치했다면 레지스트리에서 해당 행을 켜면 돼요.

## 준비물

| 앱 | 설치 위치 | 역할 | 받는 곳 |
|---|---|---|---|
| macOS 13 이상 | 프록시 호스트 | VibeProxy가 macOS 앱이에요 | — |
| VibeProxy | 프록시 호스트 | ChatGPT(Codex)와 Gemini에 OAuth로 로그인하고 8317 포트로 제공해요 | [Releases](https://github.com/automazeio/vibeproxy/releases) |
| ChatGPT 또는 Google 계정 | 프록시 호스트 | VibeProxy가 사용하는 구독이에요 | — |
| Tailscale (선택) | 두 기기 모두 | 노트북과 프록시 호스트를 잇는 사설망이에요. 같은 기기라면 필요 없어요 | [tailscale.com/download](https://tailscale.com/download) |
| Node.js 20 이상 | 노트북 | Claude Code, CCR, vmix를 실행해요 | [nodejs.org](https://nodejs.org) |
| Claude Code | 노트북 | 코딩 에이전트 화면이에요 | `npm install -g @anthropic-ai/claude-code` |
| claude-code-router 2.x | 노트북 | 3456 포트의 로컬 라우터예요 | `npm install -g @musistudio/claude-code-router@2.0.0` |
| git, curl | 노트북 | 저장소 받기, 상태 확인 | macOS 기본 포함 |
| solgate (선택) | 노트북 | GPT 가상 1M 컨텍스트 | [VoidLight00/solgate](https://github.com/VoidLight00/solgate) |

## 튜토리얼

### 1. 프록시 호스트: VibeProxy 설치와 로그인

1. VibeProxy [Releases](https://github.com/automazeio/vibeproxy/releases)에서 내려받아요(Apple Silicon은 `VibeProxy-arm64.zip`). 압축을 풀어 `/Applications`로 옮기고 실행해요.
2. 메뉴바 아이콘 → **Open Settings**를 눌러요. 서버는 자동으로 켜져요.
3. **Codex**(ChatGPT)와 **Gemini** 또는 **Antigravity** 옆의 **Connect**를 누르고 브라우저에서 로그인을 마쳐요.
4. 재부팅 후에도 프록시가 다시 켜지도록 **Launch at Login**을 켜요.
5. 모델 목록이 나오는지 확인해요.

```bash
curl -s http://127.0.0.1:8317/v1/models | head -c 400
```

여기 나오는 모델 id가 레지스트리에 넣을 수 있는 이름이에요. 새 모델이 나오면 목록도 바뀌는데, 나중에 `vmix doctor`가 대신 비교해 줘요.

### 2. 노트북에서 프록시에 접속되게 하기 (같은 기기라면 건너뛰세요)

VibeProxy는 모든 네트워크 인터페이스에서 요청을 받아요(`lsof -nP -iTCP:8317 -sTCP:LISTEN`을 실행하면 `*:8317`로 보여요). 덕분에 다른 기기에서 쓸 수 있지만, 같은 이유로 믿을 수 있는 네트워크에서만 접근되게 해야 해요.

1. 두 기기에 Tailscale을 설치하고 같은 tailnet에 로그인해요.
2. 프록시 호스트에서 `tailscale ip -4`로 주소를 확인해요(MagicDNS 이름을 써도 돼요).
3. 노트북에서 확인해요.

```bash
curl -s -m 5 http://<프록시-호스트>:8317/v1/models | head -c 200
```

8317 포트를 인터넷에 포트포워딩하면 안 돼요. 카페 같은 공용 와이파이를 쓴다면 프록시 호스트의 macOS 방화벽을 켜 두세요.

### 3. 노트북: Node.js, Claude Code, 라우터 설치

```bash
node -v                                            # v20 이상이어야 해요
npm install -g @anthropic-ai/claude-code
npm install -g @musistudio/claude-code-router@2.0.0
claude --version && ccr -v                         # ccr은 2.x가 나와야 해요
```

claude-code-router는 꼭 2.x로 설치하세요. 3.x는 데스크톱 앱과 새 게이트웨이로 다시 만들어진 버전이에요. vmix는 2.0.0에서 검증한 `CUSTOM_ROUTER_PATH` 방식을 쓰고, `install.sh`는 다른 주 버전을 발견하면 설치를 멈춰요.

### 4. vmix 설치

```bash
git clone https://github.com/VoidLight00/vmix.git
cd vmix
./install.sh --proxy-host <프록시-호스트>          # 프록시가 이 기기에 있으면 --proxy-host는 빼세요
```

설치 스크립트가 하는 일은 다음과 같아요.

- `vmix`와 `vmix-registry.mjs`를 `~/.local/bin`에 복사해요.
- `config/models.example.json`으로 `~/.config/vmix/models.json`을 만들어요. **파일이 이미 있으면 절대 덮어쓰지 않아요.**
- 실패하면 멈추는 라우터를 `~/.claude-code-router/custom-router.js`로 설치해요. 기존 라우터가 있으면 백업해요.
- `~/.claude-code-router/config.json`을 만들거나 합쳐요. 기존 provider와 설정은 그대로 두고, 시각이 붙은 백업을 남겨요.
- 마지막으로 `vmix sync`를 실행해요.

`~/.local/bin`이 `PATH`에 없으면 `~/.zshrc`에 추가할 줄을 알려 줘요.

### 5. 라우터를 켜고 점검하기

```bash
ccr restart          # 또는 ccr start
vmix doctor          # 레지스트리, 라우터 연결, 프록시 모델 목록, CCR 점검
vmix smoke           # 모델마다 작은 요청 1개: 실제로 누가 답했나?
```

`vmix smoke`는 실제 요청을 보내서 사용량이 조금 들어요. 정상이면 마지막에 `every model answered as itself`가 나오고, 등록하지 않은 Claude 모델이 거절되는 것도 함께 보여 줘요.

### 6. 사용하기

```bash
vmix                 # 레지스트리 기본 모델 (예제는 GPT-6 Sol)
vmix gemini          # Gemini 3.8 Flash
vmix gpt6 luna       # 두 단어 별칭도 돼요
vmix models          # id, 별칭, 컨텍스트 캡, /model 슬롯 보기
vmix sol -p "이 저장소 설명해줘"   # 모델 뒤의 인자는 그대로 Claude Code에 전달돼요
```

세션 안에서는 이렇게 바꿔요.

```text
/model               Opus / Sonnet / Haiku / custom 중 선택 — 레지스트리 모델과 연결돼 있어요
/model vibeproxy,gpt-6-luna[330k]   레지스트리 모델을 직접 입력해도 돼요
```

대괄호 안 값은 Claude Code가 계획할 때 쓰는 컨텍스트 크기예요. 라우터가 요청을 보내기 전에 떼어 내요. 모델의 실제 한도보다 조금 작게 적어야 대화가 길어졌을 때 프로바이더가 거절하기 전에 자동 압축이 먼저 일어나요.

### 7. 선택: solgate로 가상 1M 컨텍스트 쓰기

[solgate](https://github.com/VoidLight00/solgate)를 설치하면 CCR 설정에 `solgate` provider가 추가돼요. 그다음 레지스트리의 `*-1m` 행을 `"enabled": true`로 바꾸고 `vmix sync && ccr restart && vmix smoke sol1m`을 실행하세요. 대화가 약 30만 토큰을 넘으면 오래된 부분부터 요약해요. 모델 창이 실제로 커지는 게 아니라 요약을 이어 붙이는 방식이에요.

## 모델 추가·삭제 (유지보수)

`~/.config/vmix/models.json`에서 행 하나만 고친 뒤 이렇게 실행해요.

```bash
vmix sync && ccr restart
vmix doctor && vmix smoke <새-id>
```

| 필드 | 의미 |
|---|---|
| `id` | 프록시 `/v1/models`에 나오는 정확한 모델 id |
| `aliases` | `vmix <별칭>`에 쓰는 짧은 이름. 공백과 대소문자는 무시해요(`gpt6 luna` = `gpt6luna`) |
| `provider` | 이 모델을 제공하는 CCR provider 이름(`vibeproxy`, `solgate` 등) |
| `contextCap` | Claude Code가 계획할 컨텍스트 크기. 예: `330k`, `700k`, `1m` |
| `enabled` | `false`면 행은 남기되 라우터가 거절해요 |
| `picker` | 선택 사항. `/model` 슬롯 `opus`, `sonnet`, `haiku`, `custom` 중 하나(슬롯마다 한 번만) |
| `label` | `/model`에 보이는 이름 |

라우터는 요청마다 레지스트리를 다시 읽기 때문에, 모델을 켜고 끄는 건 바로 반영돼요. `vmix sync`와 `ccr restart`는 CCR provider 목록까지 맞춰 주는 단계예요.

## 문제 해결

| 증상 | 가능한 원인 | 해결 |
|---|---|---|
| `claude-code-router is not answering` | CCR이 꺼져 있어요 | `ccr start` 후 `vmix doctor` |
| 요청이 멈췄다가 시간 초과, `doctor`가 모델 목록을 못 읽음 | 프록시 호스트에 닿지 않아요. 재부팅 후 VPN 꺼짐, 기기 잠자기, VibeProxy 꺼짐 | Tailscale 켜기, 프록시 호스트 깨우기, VibeProxy 실행 확인 |
| `__vmix_unsupported__<모델>` 400 | 켜진 레지스트리 행이 아닌 모델(예: Claude 모델)을 골랐어요 | 의도한 동작이에요. 레지스트리 모델을 고르거나 행을 추가하세요 |
| `not offered upstream: <id>` | 프로바이더가 모델 이름을 바꿨거나 없앴어요, 또는 계정 로그인이 풀렸어요 | `/v1/models`에서 id를 확인해 고치거나 VibeProxy에서 다시 Connect |
| `smoke`가 사용량 메시지로 실패 | 구독의 사용 한도를 다 썼어요 | 초기화될 때까지 기다리거나 `/model`로 다른 모델 사용 |
| `vmix`가 예전 스크립트처럼 동작 | 같은 이름의 셸 함수나 alias가 실행 파일을 가리고 있어요 | `type vmix`가 `~/.local/bin` 경로를 가리켜야 해요 |

## 만들면서 배운 것

설계를 바꾼 실패들을 겪은 순서대로 적었어요.

1. **조용한 폴백.** 모르는 모델에 “결정 없음”을 돌려주는 라우터는 CCR이 `Router.default`를 쓰게 만들어요. 세션은 멀쩡히 돌아가는데 모델이 틀려요.
2. **“거절”처럼 보여도 전부 거절은 아니에요.** 임시 CCR을 따로 띄워 등록되지 않은 모델에 대해 방법마다 실측했어요. `null` 반환 → `Router.default`가 대신 답함, 예외 발생 → 역시 `Router.default`가 대신 답함, 없는 provider 반환 → CCR이 404, 실제 provider에 잘못된 모델 id → 프록시가 400. vmix는 마지막 방법을 써서, 거절이 CCR 내부 오류가 아니라 평범한 업스트림 오류로 끝나게 했어요.
3. **컨텍스트 라벨은 프로바이더까지 가면 안 돼요.** `gpt-6-sol[330k]`는 Claude Code용 표기라서, 그대로 올라가면 없는 모델이 돼요. 라우터가 떼어 내요.
4. **백그라운드 요청은 Haiku 슬롯을 써요.** 라우터가 Claude 모델을 거절하기 시작하면, Haiku 슬롯이 Claude 모델로 남아 있는 세션은 제목 생성 같은 백그라운드 요청이 실패해요. 그래서 `vmix`는 Haiku 슬롯과 `ANTHROPIC_SMALL_FAST_MODEL`을 항상 레지스트리 모델로 고정해요.
5. **셸 함수가 실행 파일보다 먼저예요.** 같은 이름의 옛 함수가 남아 있으면 새 실행기를 설치해도 옛 코드가 계속 돌아요.
6. **재부팅하면 VPN이 꺼질 수 있어요.** 재시작한 뒤 모든 요청이 시간 초과로 끝났는데, 원인은 꺼져 있던 Tailscale이었어요. `vmix doctor`가 이 경우를 따로 짚어 줘요.

## 노트북을 가볍게 유지하기

OAuth 세션, 토큰 갱신, 프로바이더 연결 같은 무거운 일은 프록시 호스트가 맡아요. 작성자 노트북에서 라우터는 상주 메모리 약 22 MB, 선택 구성요소인 solgate는 약 23 MB였고, 대기 중에는 둘 다 CPU를 거의 쓰지 않았어요. 항상 켜 둘 수 있는 맥(맥미니가 잘 맞아요)이 있다면 VibeProxy는 거기서 돌리고, 노트북마다 `--proxy-host`로 연결하세요.

## 보안과 약관

- 8317 포트는 사설망 안에만 두세요. 작성자 환경에서는 API 키가 없는 요청도 응답했어요. 접근할 수 있는 사람은 누구나 여러분의 구독을 쓸 수 있다는 뜻이에요.
- CCR은 기본값대로 `127.0.0.1`에서만 받게 두세요.
- `vmix`는 Claude Code를 켜기 전에 `ANTHROPIC_API_KEY`를 지워요. 실제 Anthropic 키가 로컬 라우터로 넘어가지 않게 하려는 거예요.
- 구독을 프록시로 쓰는 것은 각 프로바이더 약관의 적용을 받아요. 이 구성에 의존하기 전에 약관을 확인하세요.
- 이 프로젝트는 Anthropic, OpenAI, Google, VibeProxy, claude-code-router와 관계가 없고, 영상 소프트웨어 vMix와도 무관해요.

## 개발

```bash
node --test tests/*.test.mjs        # 오프라인 테스트: 레지스트리, 라우터, 실행기, 설치, 오류 경로
bash gates/verify_vmix.sh .         # 전체 게이트. exit 0이면 공개 준비 완료
```

테스트는 가짜 업스트림, 가짜 CCR, 가짜 `claude`를 직접 띄워서 프록시나 네트워크 없이 돌아가요.

## 라이선스

[MIT](LICENSE)
