// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Root } from "mdast";
import type { Extension as FromMarkdownExtension } from "mdast-util-from-markdown";
import type { Extension, State, Tokenizer } from "micromark-util-types";
import type {} from "remark-parse";
import type { Plugin } from "unified";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    latexMath: "latexMath";
    latexMathData: "latexMathData";
  }
}

// Parse provider-style \(...\) and \[...\] before Markdown escapes their
// delimiters. A syntax extension leaves code, links and escaped backslashes
// under the Markdown parser's control instead of rewriting the source text.
const tokenize: Tokenizer = function (effects, ok, nok) {
  let closing: number;
  const start: State = (code) => {
    effects.enter("latexMath");
    effects.enter("latexMathData");
    effects.consume(code);
    return open;
  };
  const open: State = (code) => {
    if (code !== 40 && code !== 91) return nok(code);
    closing = code === 40 ? 41 : 93;
    effects.consume(code);
    return content;
  };
  const between: State = (code) => {
    if (code === null) return nok(code);
    // Micromark uses negative codes for CR, LF and CRLF. Keep line-ending
    // events so its paragraph/list tokenizer can stitch multiline math.
    if (code >= -5 && code <= -3) {
      effects.enter("lineEnding");
      effects.consume(code);
      effects.exit("lineEnding");
      return between;
    }
    effects.enter("latexMathData");
    return content(code);
  };
  const content: State = (code) => {
    if (code === null || (code >= -5 && code <= -3)) {
      effects.exit("latexMathData");
      return between(code);
    }
    effects.consume(code);
    return code === 92 ? escape : content;
  };
  const escape: State = (code) => {
    if (code !== closing && code !== 92) return content(code);
    effects.consume(code);
    if (code !== closing) return content;
    effects.exit("latexMathData");
    effects.exit("latexMath");
    return ok;
  };
  return start;
};

const syntax: Extension = {
  text: { 92: { name: "latexMath", tokenize } },
};
const fromMarkdown: FromMarkdownExtension = {
  enter: {
    latexMath(token) {
      const source = this.sliceSerialize(token);
      const value = source.slice(2, -2);
      this.enter(
        {
          type: "inlineMath",
          value,
          data: {
            hName: "code",
            hProperties: {
              className: [
                "language-math",
                source.startsWith("\\[") ? "math-display" : "math-inline",
              ],
            },
            hChildren: [{ type: "text", value }],
          },
        },
        token,
      );
    },
  },
  exit: {
    latexMath(token) {
      this.exit(token);
    },
  },
};

const remarkLatexDelimiters: Plugin<[], Root> = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
};
export default remarkLatexDelimiters;
