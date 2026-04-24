export type ErrorItem = {
  field: string | null;
  message: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ResponsePayload = {
  success?: boolean;
  message?: string;
  data?: unknown;
  meta?: PaginationMeta;
};

export type StandardResponse = {
  success: true;
  message: string;
  data: unknown | null;
  meta?: PaginationMeta;
};
