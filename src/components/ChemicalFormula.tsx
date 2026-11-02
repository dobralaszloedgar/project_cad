export default function ChemicalFormula({ formula }: { formula?: string }) {
  return formula
    ?.split(/(\d+)/)
    .map((part, index, parts) =>
      /^\d+$/.test(part) && /[A-Za-z)\]]$/.test(parts[index - 1] ?? "") ? (
        <sub key={index}>{part}</sub>
      ) : (
        part
      ),
    );
}
