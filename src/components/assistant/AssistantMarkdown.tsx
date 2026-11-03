// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { memo } from "react";
import { renderToString } from "katex";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkLatexDelimiters from "./remark-latex-delimiters";
import "katex/dist/katex.min.css";
import styles from "../AssistantPanel.module.css";

const plugins = [remarkGfm, remarkMath, remarkLatexDelimiters];
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => <span>{alt || "Image"}</span>,
  code: ({ className, children }) => {
    const classes = className?.split(/\s+/) ?? [];
    if (!classes.includes("language-math"))
      return <code className={className}>{children}</code>;
    const displayMode = !classes.includes("math-inline");
    const latex = String(children).replace(/\n$/, "");
    return (
      <span
        className={displayMode ? styles.mathDisplay : styles.mathInline}
        dangerouslySetInnerHTML={{
          __html: renderToString(latex, {
            displayMode,
            output: "htmlAndMathml",
            throwOnError: false,
            errorColor: "currentColor",
            strict: "ignore",
            trust: false,
            maxSize: 20,
            maxExpand: 1000,
          }),
        }}
      />
    );
  },
  pre: ({ node, children }) =>
    node?.children.some(
      (child) =>
        child.type === "element" &&
        child.tagName === "code" &&
        Array.isArray(child.properties.className) &&
        child.properties.className.includes("language-math"),
    ) ? (
      <>{children}</>
    ) : (
      <pre>{children}</pre>
    ),
};

export default memo(function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className={`chat-response ${styles.response}`}>
      <Markdown remarkPlugins={plugins} skipHtml components={components}>
        {text}
      </Markdown>
    </div>
  );
});
