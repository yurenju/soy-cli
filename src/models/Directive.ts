import "reflect-metadata";

export const DATE_FORMAT = "YYYY-MM-DD";
export const DEFAULT_ACCOUNT = "Assert:Unknown";
export const DEFAULT_SYMBOL = "USD";

export abstract class Directive {
  readonly type: string = "directive";
  [key: string]: any;

  abstract toString(): string;
}
