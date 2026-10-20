export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAt?: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !["gmail.googleapis.com", "graph.microsoft.com"].includes(u.hostname)
  )
    throw new Error("Unexpected API continuation URL.");
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const retryAt = retry
      ? Date.now() +
        (Number.isFinite(Number(retry))
          ? Number(retry) * 1000
          : Math.max(0, Date.parse(retry) - Date.now()))
      : undefined;
    throw new ApiError(
      response.status === 401
        ? "Sign-in expired. Reconnect your mailbox."
        : response.status === 403
          ? "Mailbox permission denied. Check consent or your organization’s policy."
          : response.status === 429
            ? "Provider rate limit reached. Sync will retry later."
            : `Mail provider returned ${response.status}.`,
      response.status,
      retryAt,
    );
  }
  return response.json();
}
