// 로컬 타입 검사용: AppDeploy 가 배포 시 주입하는 @appdeploy/client 의 타입 (SDK 문서 그대로)
declare module '@appdeploy/client' {
  export interface Api {
    get(url: string, data?: any): Promise<{ data: any }>;
    post(url: string, data?: any): Promise<{ data: any }>;
    put(url: string, data?: any): Promise<{ data: any }>;
    delete(url: string, data?: any): Promise<{ data: any }>;
  }
  export const api: Api;

  export interface AuthUser {
    userId: string;
    email?: string;
    name?: string;
    picture?: string;
    scope: string;
  }
  export interface SignInOptions {
    scope?: string;
  }
  export interface SignInResult {
    user: AuthUser;
    accessToken: string;
    expiresIn: number;
  }
  export interface AuthAPI {
    signIn(options?: SignInOptions): Promise<SignInResult>;
    getUser(): Promise<AuthUser | null>;
    getAccessToken(): Promise<string | null>;
    signOut(): Promise<void>;
    isSignedIn(): boolean;
  }
  export const auth: AuthAPI;
}
