// 로컬 타입 검사용: AppDeploy 가 주입하는 @appdeploy/sdk 의 타입 (SDK 문서 그대로)
declare module '@appdeploy/sdk' {
  export interface AuthUser {
    userId: string;
    email?: string;
    name?: string;
    scope: string;
  }
  export interface RouterContext {
    body: unknown;
    query: Record<string, string>;
    params: Record<string, string>;
    event: any;
    user?: AuthUser;
  }
  export interface RouterResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }
  export type RouterMiddleware = (ctx: RouterContext) => Promise<RouterResponse | void> | RouterResponse | void;
  export type RouterRoutes = Record<string, RouterMiddleware[]>;
  export function router(routes: RouterRoutes): (event: any) => Promise<RouterResponse>;
  export function json(data: unknown, status?: number): RouterResponse;
  export function error(message: string, status?: number): RouterResponse;

  export const auth: {
    getUser(event: { headers?: Record<string, string | undefined> }): Promise<AuthUser | null>;
    hasScope(user: AuthUser, scope: string): boolean;
    requireScope(user: AuthUser, scope: string): void;
  };
  export function requireAuth(): RouterMiddleware;
  export function withScopes(...scopes: string[]): RouterMiddleware;
  export function requireAdminEmailAllowlist(adminEmails: string[]): RouterMiddleware;

  export const db: {
    add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>>;
    update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>): Promise<boolean[]>;
    get<T = Record<string, any>>(table: string, ids: string[]): Promise<Array<T | null>>;
    list<T = Record<string, any>>(
      table: string,
      options?: { filter?: Record<string, unknown>; nextToken?: string; limit?: number },
    ): Promise<{ items: Array<Omit<T, 'id'> & { id: string }>; nextToken?: string }>;
    delete(table: string, ids: string[]): Promise<boolean[]>;
  };

  export const storage: {
    write(items: Array<{ path: string; content: string; contentType: string }>): Promise<boolean[]>;
    read(paths: string[]): Promise<Array<{ path: string; content: string | null }>>;
    url(paths: string[]): Promise<Array<{ path: string; url: string }>>;
    list(options?: { prefix?: string; nextToken?: string; limit?: number }): Promise<{ paths: string[]; nextToken?: string }>;
    delete(paths: string[]): Promise<boolean[]>;
  };
}
