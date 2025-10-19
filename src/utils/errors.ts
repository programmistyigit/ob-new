export class OblivionLogError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'OblivionLogError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends OblivionLogError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class SessionError extends OblivionLogError {
  constructor(message: string) {
    super(message, 'SESSION_ERROR', 403);
    this.name = 'SessionError';
  }
}

export class DatabaseError extends OblivionLogError {
  constructor(message: string) {
    super(message, 'DB_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

export class TelegramApiError extends OblivionLogError {
  constructor(message: string, originalError?: any) {
    super(message, 'TELEGRAM_API_ERROR', 502);
    this.name = 'TelegramApiError';
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

export const handleError = (error: unknown, context: string): OblivionLogError => {
  if (error instanceof OblivionLogError) {
    return error;
  }

  if (error instanceof Error) {
    return new OblivionLogError(
      `${context}: ${error.message}`,
      'UNKNOWN_ERROR',
      500
    );
  }

  return new OblivionLogError(
    `${context}: Unknown error occurred`,
    'UNKNOWN_ERROR',
    500
  );
};
