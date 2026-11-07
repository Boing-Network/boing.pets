export class YardError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
