// A bounded arithmetic parser. User expressions never execute JavaScript.
type Node = ((values: Record<string, number>) => number) & {
  latex: string;
  precedence: number;
};
const node = (
  evaluate: (values: Record<string, number>) => number,
  latex: string,
  precedence = 5,
): Node => Object.assign(evaluate, { latex, precedence });
const wrap = (value: Node, precedence: number) =>
  value.precedence < precedence ? `\\left(${value.latex}\\right)` : value.latex;
export const escapeMathText = (text: string) =>
  text.replace(
    /[\\{}_$%&#^~]/g,
    (character) =>
      ({
        "\\": "\\textbackslash{}",
        "^": "\\textasciicircum{}",
        "~": "\\textasciitilde{}",
      })[character] ?? `\\${character}`,
  );
export function rateSymbolLatex(symbol: string) {
  const match = /^(kf|kr|[A-Za-z]+?)([0-9]+)?$/.exec(symbol);
  if (symbol === "kf" || symbol === "kr") return `k_{${symbol[1]}}`;
  if (match?.[2]) return `${match[1]}_{${match[2]}}`;
  return `\\mathit{${escapeMathText(symbol)}}`;
}
const functions: Record<
  string,
  { arity: number; call: (...args: number[]) => number }
> = {
  exp: { arity: 1, call: Math.exp },
  log: { arity: 1, call: Math.log },
  ln: { arity: 1, call: Math.log },
  sqrt: { arity: 1, call: Math.sqrt },
  abs: { arity: 1, call: Math.abs },
  min: { arity: 2, call: Math.min },
  max: { arity: 2, call: Math.max },
  pow: { arity: 2, call: Math.pow },
};
export const reservedRateSymbols = new Set([
  "T",
  "P",
  "R",
  ...Object.keys(functions),
]);

function parseRateExpression(
  expression: string,
  symbols: string[],
  labels: Record<string, string> = {},
) {
  if (!expression.trim())
    throw new Error("Enter a rate expression or choose the table builder.");
  if (expression.length > 4000)
    throw new Error("Keep the expression under 4000 characters.");
  const tokens: { text: string; position: number }[] = [];
  const pattern =
    /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*|\*\*|[+\-*/^(),]/gy;
  let offset = 0;
  while (offset < expression.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(expression);
    if (!match)
      throw new Error(
        `Unexpected “${expression[offset]}” at character ${offset + 1}. Use +, −, *, /, ^ and parentheses.`,
      );
    if (match[0].trim()) tokens.push({ text: match[0], position: offset + 1 });
    offset = pattern.lastIndex;
  }
  if (tokens.length > 800)
    throw new Error("The expression is too complex (maximum 800 tokens).");
  let i = 0;
  const known = new Set([...symbols, "T", "P", "R"]);
  const peek = () => tokens[i]?.text;
  const error = (message: string): never => {
    throw new Error(
      `${message} at character ${tokens[i]?.position ?? expression.length + 1}.`,
    );
  };
  const checked = (n: number) => {
    if (!Number.isFinite(n))
      throw new Error(
        "Rate is not finite: check division by zero, logarithms, fractional/negative powers at zero, and parameter magnitudes.",
      );
    return n;
  };
  function atom(): Node {
    const token = peek();
    if (token === "(") {
      i++;
      const inner = addition();
      if (peek() !== ")") error("Missing closing parenthesis");
      i++;
      return inner;
    }
    if (token && /^(?:\d|\.)/.test(token)) {
      i++;
      const n = checked(Number(token));
      const scientific = /^(.+)[eE]([+-]?\d+)$/.exec(token);
      return node(
        () => n,
        scientific
          ? `${scientific[1]} \\times 10^{${Number(scientific[2])}}`
          : token,
        scientific ? 2 : 5,
      );
    }
    if (token && /^[A-Za-z]/.test(token)) {
      i++;
      if (peek() === "(") {
        const fn = Object.hasOwn(functions, token)
          ? functions[token]
          : undefined;
        if (!fn) error(`Unknown function “${token}”`);
        i++;
        const args: Node[] = [addition()];
        while (peek() === ",") {
          i++;
          args.push(addition());
        }
        if (peek() !== ")") error("Missing closing parenthesis");
        i++;
        if (args.length !== fn!.arity)
          error(`${token} needs ${fn!.arity} argument(s)`);
        const latex =
          token === "sqrt"
            ? `\\sqrt{${args[0].latex}}`
            : token === "abs"
              ? `\\left|${args[0].latex}\\right|`
              : token === "pow"
                ? `${wrap(args[0], 5)}^{${args[1].latex}}`
                : `\\${token === "log" ? "ln" : token}\\left(${args.map((a) => a.latex).join(", ")}\\right)`;
        return node(
          (v) => checked(fn!.call(...args.map((arg) => arg(v)))),
          latex,
          token === "pow" ? 4 : 5,
        );
      }
      if (!known.has(token))
        error(
          `Unknown symbol “${token}”; add it to the species or parameter table`,
        );
      return node(
        (v) => checked(v[token]),
        Object.hasOwn(labels, token) ? labels[token] : rateSymbolLatex(token),
      );
    }
    return error("Expected a number, species symbol, parameter or parenthesis");
  }
  function power(): Node {
    const left = atom();
    if (peek() === "^" || peek() === "**") {
      i++;
      const right = unary();
      return node(
        (v) => checked(left(v) ** right(v)),
        `${wrap(left, 5)}^{${right.latex}}`,
        4,
      );
    }
    return left;
  }
  function unary(): Node {
    if (peek() === "+") {
      i++;
      return unary();
    }
    if (peek() === "-") {
      i++;
      const n = unary();
      return node((v) => -n(v), `-${wrap(n, 4)}`, 3);
    }
    return power();
  }
  function multiplication(): Node {
    let left = unary();
    while (peek() === "*" || peek() === "/") {
      const op = peek();
      i++;
      const right = unary(),
        prior = left;
      left = node(
        (v) => checked(op === "*" ? prior(v) * right(v) : prior(v) / right(v)),
        op === "*"
          ? `${wrap(prior, 2)} \\, ${wrap(right, 2)}`
          : `\\frac{${prior.latex}}{${right.latex}}`,
        2,
      );
    }
    return left;
  }
  function addition(): Node {
    let left = multiplication();
    while (peek() === "+" || peek() === "-") {
      const op = peek();
      i++;
      const right = multiplication(),
        prior = left;
      left = node(
        (v) => checked(op === "+" ? prior(v) + right(v) : prior(v) - right(v)),
        `${prior.latex} ${op} ${wrap(right, op === "-" ? 2 : 1)}`,
        1,
      );
    }
    return left;
  }
  const evaluate = addition();
  if (i !== tokens.length)
    error(`Unexpected “${peek()}”; put * between multiplied terms`);
  return node(
    (values: Record<string, number>) => checked(evaluate(values)),
    evaluate.latex,
    evaluate.precedence,
  );
}
export function compileRateExpression(expression: string, symbols: string[]) {
  return parseRateExpression(expression, symbols);
}
export function rateExpressionLatex(
  expression: string,
  symbols: string[],
  labels: Record<string, string> = {},
) {
  return parseRateExpression(expression, symbols, labels).latex;
}
