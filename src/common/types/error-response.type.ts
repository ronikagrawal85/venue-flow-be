export type ErrorResponse = {
  statusCode: number;
  message: string;
  errors?: string[];
  path?: string;
  timestamp: string;
  correlationId?: string;
};
