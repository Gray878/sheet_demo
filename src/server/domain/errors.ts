export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown[] = []
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(message = "Resource not found") {
  return new AppError(404, "NOT_FOUND", message);
}

export function validationError(message: string, details: unknown[] = []) {
  return new AppError(400, "VALIDATION_ERROR", message, details);
}

export function unprocessable(message: string, details: unknown[] = []) {
  return new AppError(422, "UNPROCESSABLE_ENTITY", message, details);
}
