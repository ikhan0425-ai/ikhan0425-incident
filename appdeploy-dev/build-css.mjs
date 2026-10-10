// appdeploy-dev/tailwind.css(Tailwind v4 원본)를 일반 CSS 로 바꿔 appdeploy/src/index.css 에 쓴다.
// AppDeploy 빌드는 PostCSS + Tailwind v3 만 지원하므로 v4 결과물을 미리 만들어 보낸다.
// 사용: node appdeploy-dev/build-css.mjs [--check]   (--check: 결과가 다르면 실패)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../appdeploy');
const require = createRequire(import.meta.url);
const { compile, optimize } = await import(require.resolve('@tailwindcss/node'));
const { Scanner } = await import(require.resolve('@tailwindcss/oxide'));

const input = path.join(here, 'tailwind.css');
const output = path.join(app, 'src/index.css');

const compiler = await compile(fs.readFileSync(input, 'utf8'), { base: here, from: input, onDependency() {} });
const sources = [
  ...(compiler.root === 'none'
    ? []
    : compiler.root === null
      ? [{ base: here, pattern: '**/*', negated: false }]
      : [{ ...compiler.root, negated: false }]),
  ...compiler.sources,
];
const candidates = new Scanner({ sources }).scan();
const { code } = optimize(compiler.build(candidates), { file: output, minify: false });

const css =
  '/* 자동 생성 파일 — 직접 고치지 말 것.\n' +
  '   원본: appdeploy-dev/tailwind.css → node appdeploy-dev/build-css.mjs */\n' +
  code;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  if (current !== css) {
    console.error('src/index.css 가 최신이 아닙니다. node appdeploy-dev/build-css.mjs 를 실행하세요.');
    process.exit(1);
  }
  console.log('src/index.css is up to date');
} else {
  fs.writeFileSync(output, css);
  console.log(`wrote ${path.relative(process.cwd(), output)} (${(css.length / 1024).toFixed(1)} KB, ${candidates.length} candidates)`);
}
