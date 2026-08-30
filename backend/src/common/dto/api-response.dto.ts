export class ApiResponseDto<T> {
  success: boolean;
  message: string;
  data?: T;

  constructor(success: boolean, message: string, data?: T) {
    this.success = success;
    this.message = message;
    this.data = data;
  }

  static ok<T>(message: string, data?: T): ApiResponseDto<T> {
    return new ApiResponseDto(true, message, data);
  }

  static fail(message: string): ApiResponseDto<null> {
    return new ApiResponseDto(false, message, null);
  }
}
