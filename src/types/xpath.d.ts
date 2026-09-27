declare module 'xpath' {
  export function select(expression: string, node?: unknown): unknown[]
  export function evaluate(expression: string, node?: unknown): unknown
  export function useNamespaces(mappings: Record<string, string>): (expr: string, node?: unknown) => unknown[]
  const xpath: {
    select: typeof select
    evaluate: typeof evaluate
    useNamespaces: typeof useNamespaces
  }
  export default xpath
}
