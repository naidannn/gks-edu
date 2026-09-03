/** Shape every error response from the API follows. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** Correlation id, echoed back in the `x-request-id` header. */
  requestId?: string;
  timestamp: string;
  path: string;
}

/** Payload carried inside a signed access token. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
