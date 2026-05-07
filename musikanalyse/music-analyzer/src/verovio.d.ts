declare module 'verovio/wasm' {
  export default function createVerovioModule(moduleArg?: object): Promise<object>;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: object);
    setOptions(options: Record<string, unknown>): void;
    resetOptions(): void;
    loadData(data: string): boolean;
    renderToSVG(pageNo?: number, xmlDeclaration?: boolean): string;
    getPageCount(): number;
    destroy(): void;
  }
  export function enableLog(level: number, module: object): void;
  export const LOG_OFF: number;
  export const LOG_ERROR: number;
  export const LOG_WARNING: number;
  export const LOG_INFO: number;
  export const LOG_DEBUG: number;
}
