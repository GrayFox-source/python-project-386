export type ValidationIssue = {
  loc?: Array<string | number>
  msg?: string
  type?: string
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly issues: ValidationIssue[]

  constructor(error: unknown, status: number) {
    const detail =
      typeof error === "object" && error !== null && "detail" in error
        ? error.detail
        : undefined

    if (Array.isArray(detail)) {
      const issues = detail.filter(
        (issue): issue is ValidationIssue =>
          typeof issue === "object" && issue !== null
      )
      super(
        issues
          .map((issue) => issue.msg)
          .filter((message): message is string => Boolean(message))
          .join("; ") || "Validation failed"
      )
      this.issues = issues
    } else {
      const domainDetail = detail as
        | { code?: string; message?: string }
        | undefined
      super(domainDetail?.message ?? "Request failed")
      this.code = domainDetail?.code
      this.issues = []
    }

    this.name = "ApiRequestError"
    this.status = status
  }
}

export function unwrap<T>(
  data: T | undefined,
  error: unknown,
  response: Response | undefined
): T {
  if (error || data === undefined) {
    throw new ApiRequestError(error, response?.status ?? 0)
  }

  return data
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401
}
