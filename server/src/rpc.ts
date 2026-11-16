export class Rpc {
  constructor(..._args: unknown[]) {}

  async call<T>(..._args: unknown[]): Promise<T | null> {
    return null;
  }
}
