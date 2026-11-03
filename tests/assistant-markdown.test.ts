// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AssistantMarkdown from "../src/components/assistant/AssistantMarkdown";

const render = (text: string) =>
  renderToStaticMarkup(createElement(AssistantMarkdown, { text }));
const equations = (html: string) => html.match(/class="katex"/g) ?? [];

describe("assistant equation rendering", () => {
  it("typesets inline engineering equations with accessible fractions and subscripts", () => {
    const html = render(
      String.raw`Vapor density: $\rho_V = \frac{P\bar M}{RT}$, ideal gas per tray.`,
    );
    expect(equations(html)).toHaveLength(1);
    expect(html).toContain('class="mfrac"');
    expect(html).toContain("<msub>");
    expect(html).toContain('<annotation encoding="application/x-tex">');
    expect(html).toContain("ideal gas per tray.");
    expect(html).not.toContain("<code");
    expect(html).not.toContain('class="katex-display"');
  });

  it("renders dollar and backslash display math, including aligned equations", () => {
    const html = render(String.raw`$$
\rho_V = \frac{P\bar M}{RT}
$$

\[
\begin{aligned}
F_{LV} &= \frac{\dot L}{\dot V}\sqrt{\frac{\rho_V}{\rho_L}} \\
U_f &= C\sqrt{\frac{\rho_L-\rho_V}{\rho_V}}
\end{aligned}
\]`);
    expect(equations(html)).toHaveLength(2);
    expect(html.match(/class="katex-display"/g)).toHaveLength(2);
    expect(html.match(/display="block"/g)).toHaveLength(2);
    expect(html).toContain("<mtable");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("katex-error");
  });

  it("preserves math in lists, tables and link labels alongside GFM", () => {
    const html =
      render(String.raw`- Jet flood: \(U_a/U_f\), **check** the limit.

| Property | Value |
| --- | --- |
| Density | $\rho_L = 1000\,\mathrm{kg/m^3}$ |
| Tension | \(\sigma = 0.072\,\mathrm{N/m}\) |

[The \(F_{LV}\) relation](https://example.com)`);
    expect(equations(html)).toHaveLength(4);
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>check</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("katex-error");
  });

  it("leaves inline, fenced and indented code, escaped delimiters and prices literal", () => {
    const html = render(
      [
        "`" + String.raw`$x$ \(y\) \[z\]` + "`",
        "",
        "````ts",
        String.raw`const equation = "\(x\)"; // $y$`,
        "```",
        String.raw`\[z\]`,
        "````",
        "",
        String.raw`    \(a\) $b$`,
        "",
        String.raw`Prices: \$5 and \$10. Escaped: \\(x\\) and \\[y\\].`,
      ].join("\n"),
    );
    expect(equations(html)).toHaveLength(0);
    expect(html).toContain(String.raw`<code>$x$ \(y\) \[z\]</code>`);
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("Prices: $5 and $10.");
    expect(html).toContain(String.raw`Escaped: \(x\) and \[y\].`);
  });

  it("supports explicitly marked math fences without turning ordinary code into math", () => {
    const html = render("```math\n\\frac{1}{2}\n```\n\n```js\nx = 1 / 2\n```");
    expect(equations(html)).toHaveLength(1);
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('<pre><code class="language-js">');
  });

  it("keeps incomplete streamed and malformed math readable without throwing", () => {
    for (const text of [
      String.raw`Density: $\rho_V = \frac{`,
      String.raw`Density: \(\rho_V = \frac{`,
      "$$\n\\frac{",
      String.raw`\[\frac{1}{\]`,
      String.raw`$\frac{1}{$`,
    ]) {
      expect(() => render(text)).not.toThrow();
      expect(render(text).length).toBeGreaterThan(0);
    }
    expect(render(String.raw`$\frac{1}{$`)).toContain("katex-error");
    expect(render(String.raw`$\frac{1}{2}$`)).not.toContain("katex-error");
    expect(
      render(String.raw`\(x\)

**Still readable**`),
    ).toContain("<strong>Still readable</strong>");
  });

  it("handles every streamed prefix and multiline math inside Markdown containers", () => {
    const message = String.raw`- Density:

  \[
  \rho_V = \frac{P\bar M}{RT}
  \]

> \(F_{LV} =
> \frac{\dot L}{\dot V}\)`;
    for (const newline of ["\n", "\r\n"]) {
      const source = message.replaceAll("\n", newline);
      for (let end = 1; end <= source.length; end++)
        expect(() => render(source.slice(0, end))).not.toThrow();
      const html = render(source);
      expect(equations(html)).toHaveLength(2);
      expect(html).not.toContain("katex-error");
      expect(html).toContain("<blockquote>");
    }
  });

  it("does not enable HTML or trusted LaTeX commands", () => {
    const html = render(String.raw`<script>alert(1)</script>

$\href{javascript:alert(1)}{click}$

\(\includegraphics{https://example.com/tracker.png}\)

$\htmlClass{injected}{x}$`);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('class="injected"');
  });
});
