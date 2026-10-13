// Shared without importing intake/form modules, to keep validation errors cycle-free.
export class HttpError extends Error {constructor(status,message,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;}}
