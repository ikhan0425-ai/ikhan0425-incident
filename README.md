# 그림터 — AI 그림 모델 & 이미지 공유 커뮤니티

[Civitai](https://civitai.com) 같은 사이트를 한국어로 만든 프로젝트입니다.
사용자가 직접 만든 **모델(체크포인트, LoRA, VAE, ControlNet 등)** 과 그 모델로 만든 **AI 이미지**를 올리고,
이미지마다 **프롬프트 · 네거티브 프롬프트 · 샘플러 · 스텝 · CFG · 시드**를 바로 확인할 수 있습니다.

## 주요 기능

### 1. 카드형 썸네일 & 필터링 (`/`)
- **카테고리 필터**: 체크포인트 · LoRA · LyCORIS · 임베딩 · VAE · ControlNet · 업스케일러 · 워크플로 · 기타 (여러 개 선택 가능)
- **태그 다중 검색**: `#애니메이션 #실사 #3D #스타일 #캐릭터` 등. 여러 태그를 고르면 **모두 가진** 모델만 보여요. 사용자가 직접 만든 태그도 인기순으로 함께 표시
- **베이스 모델 필터**: SD 1.5, SDXL, Pony, Illustrious, NoobAI, SD 3.5, Flux.1/2, Qwen-Image
- **정렬**: 최신순 · 다운로드순 · 좋아요순 × **기간** 전체 · 연간 · 월간 · 주간 · 일간
  - 다운로드/좋아요는 시점이 기록되므로 "이번 주에 가장 많이 받은 모델"처럼 실제 기간 내 활동으로 정렬됩니다.
- 검색(모델 이름, 태그, 제작자), 무한 스크롤, 필터 상태가 URL 에 남아 공유 가능

### 2. 모델 상세 & 프롬프트 프리뷰 (`/models/[id]`)
- 버전 탭(v1.0, v2.0 …), 버전별 베이스 모델 · 트리거 단어(클릭 복사) · 파일 크기 · AutoV2 해시
- **제작자 샘플 갤러리**(가로 스크롤) + **커뮤니티 갤러리**(다른 사람들이 이 모델로 만든 이미지, 메이슨리)
- **오버레이**: 이미지에 마우스를 올리면 프롬프트, Negative, Sampler, Steps, CFG, Seed 가 겹쳐 보임 (터치 기기는 ⓘ 버튼)
- **라이트박스**: 클릭하면 원본 이미지 + 전체 생성 정보, 항목별 복사, "전체 생성 정보 복사"(A1111 PNG Info 형식), ←/→ 키 이동
- 좋아요, 다운로드 수 집계, 이미지 올리기, (제작자) 새 버전 추가 · 삭제

### 3. 업로드
- **모델 업로드** (`/models/new`): 모델 파일 드래그&드롭(대용량 스트리밍 업로드, 진행률 표시) 또는 Hugging Face 등 외부 링크
- **이미지 올리기** (`/images/new`): 모델/버전을 골라 커뮤니티 갤러리에 게시
- **생성 정보 자동 인식**: 원본 이미지를 넣으면 브라우저에서 바로 메타데이터를 읽어 폼을 채워 줍니다
  - A1111 / Forge / SD.Next (`parameters` PNG 청크, JPEG·WebP EXIF UserComment)
  - ComfyUI (`prompt` 그래프 → KSampler / SamplerCustomAdvanced 를 따라가 프롬프트·시드 추출)
  - NovelAI, InvokeAI
- 모델을 고르지 않아도 이미지 속 `Model hash` 로 등록된 체크포인트를 찾아 자동 연결
- `.ckpt`, `.pt` 등 pickle 형식 파일에는 보안 경고 표시

### 기타
- 이미지 피드(`/images`, 프롬프트 검색), 이미지 상세(`/images/[id]`), 프로필(`/users/[아이디]`)
- 회원가입/로그인 (아이디 + 닉네임, 비밀번호는 scrypt 해시, 세션은 httpOnly 쿠키)
- 성인(19+) 콘텐츠 표시 시 썸네일 블러 처리, 눌러서 보기
- 다크 테마, 모바일 대응

## 실행 방법

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run seed      # 샘플 데이터 생성 (모델 18개, 이미지 약 150장)
npm run dev       # http://localhost:3000
```

데모 계정: `minji_art`, `doyun_ai`, `sora_lab`, `hanbit3d`, `pixel_jun`, `mukmuk` / 비밀번호 `demo1234`
(직접 회원가입해도 됩니다.)

> 샘플 데이터의 그림은 SVG 로 절차적으로 생성한 추상/풍경 그림이고, 모델 파일은 텐서가 없는 빈 `.safetensors` 입니다.
> 이미 데이터가 있으면 seed 가 멈춥니다. 모두 지우고 다시 만들려면 서버를 끄고 `npm run seed -- --force`.

배포용 실행:

```bash
npm run build
npm run start     # 기본 포트 3000, PORT=8080 npm run start 처럼 변경 가능
```

### 환경 변수 (`.env.example` 참고)

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `DATA_DIR` | `./data` | SQLite DB 와 업로드 파일이 저장되는 폴더 |
| `MAX_MODEL_SIZE_MB` | `8192` | 모델 파일 최대 크기 (MB) |

### 테스트

```bash
npm run typecheck
npm run lint
npm test          # 메타데이터 파서 단위 테스트 (A1111 / ComfyUI / NovelAI / PNG·JPEG 청크)
```

## 기술 구성

- **Next.js 16** (App Router, Cache Components / Partial Prerendering) + React 19 + TypeScript
- **Tailwind CSS v4**, 글꼴 Pretendard
- **SQLite** (`better-sqlite3`) — 별도 DB 서버 없이 파일 하나로 동작
- **sharp** — 썸네일(WebP) 생성, 대표 색상 추출, 이미지 형식 검증
- **busboy** — 수 GB 모델 파일을 메모리에 올리지 않고 디스크로 스트리밍

```
src/
  app/                    페이지와 API 라우트
    page.tsx              모델 둘러보기 (필터/정렬)
    models/[id]/          모델 상세, 새 버전
    images/               이미지 피드, 상세, 올리기
    api/                  업로드·좋아요·다운로드·인증 API
    files/[kind]/[name]/  업로드된 이미지 제공
  components/             카드, 필터, 오버레이, 라이트박스, 업로드 폼
  lib/
    generation.ts         생성 정보 파서 (A1111 / ComfyUI / NovelAI / InvokeAI)
    image-metadata.ts     PNG·JPEG·WebP 메타데이터 읽기 (브라우저/서버 공용)
    filters.ts            URL ↔ 필터 변환
    server/               DB 스키마, 쿼리, 인증, 저장소, 업로드 처리
scripts/seed.ts           샘플 데이터 생성
tests/                    단위 테스트
```

## 운영 전에 고려할 점

- **호스팅**: SQLite 와 로컬 디스크에 파일을 저장하므로, 서버리스(Vercel 등)가 아닌 **디스크가 유지되는 서버**(VPS, Docker + 볼륨 등)에서 실행해야 합니다.
  사용자가 늘면 파일은 S3 호환 스토리지(Cloudflare R2, NCP Object Storage 등)로, DB 는 PostgreSQL 로 옮기는 것을 권장합니다.
- **대용량 모델 파일**: 체크포인트는 수 GB 라 저장 공간·트래픽 비용이 큽니다. 처음에는 외부 링크(Hugging Face) 위주로 운영하거나 용량 제한을 두는 방법도 있습니다.
- **법적 책임**: 한국에서 성인 콘텐츠를 다루려면 청소년유해매체물 표시·성인 인증 의무가 있고, 실존 인물 딥페이크·아동 성착취물은 생성·소지·유포 모두 처벌 대상입니다.
  신고 기능, 관리자 검토, 이용약관·개인정보처리방침을 공개 전에 갖추세요.
- **보안**: pickle 형식(`.ckpt`, `.pt`) 모델은 악성 코드를 담을 수 있습니다. 공개 운영 시 업로드 파일 검사(예: picklescan)를 추가하세요.

## 다음에 추가하면 좋은 것

- 모델·이미지 신고 및 관리자 페이지
- 댓글/리뷰, 팔로우, 알림
- 모델 정보 수정, 버전별 파일 여러 개(fp16/pruned 등)
- 업로드 시 picklescan 검사, 이미지 NSFW 자동 분류
- 오브젝트 스토리지 + CDN, 다운로드 속도 제한
