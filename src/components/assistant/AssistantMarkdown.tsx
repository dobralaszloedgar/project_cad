import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../AssistantPanel.module.css";
const plugins = [remarkGfm];
export default memo(function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className={`chat-response ${styles.response}`}>
      <Markdown
        remarkPlugins={plugins}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>{alt || "Image"}</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
});
