// Generic envelope shape for API responses, used for Swagger/OpenAPI typing.
export class ApiResponseDto<T> {
  success!: boolean;
  message!: string;
  data!: T | null;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
