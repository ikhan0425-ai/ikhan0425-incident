/** 사용자에게 그대로 보여줘도 되는 오류 (입력값 검증 실패 등) */
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
