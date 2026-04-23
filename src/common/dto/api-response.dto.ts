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