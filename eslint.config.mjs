import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // AppDeploy 배포용 포트(별도 프로젝트)와 로컬 테스트 도구
    "appdeploy/**",
    "appdeploy-dev/**",
  ]),
]);

export default eslintConfig;
