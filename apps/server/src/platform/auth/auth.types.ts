export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  mfaVerified: boolean;
  permissions: Set<string>;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
