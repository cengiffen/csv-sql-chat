declare module "papaparse" {
  export type ParseConfig = {
    header?: boolean;
    dynamicTyping?: boolean;
    skipEmptyLines?: boolean;
    delimiter?: string;
  };

  export type ParseError = { message: string };

  export type ParseResult<T> = {
    data: T[];
    errors: ParseError[];
  };

  const Papa: {
    parse: <T = unknown>(csv: string, config?: ParseConfig) => ParseResult<T>;
  };

  export default Papa;
}
