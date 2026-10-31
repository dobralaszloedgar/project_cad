import { THEMES } from "@/lib/theme";
import styles from "./ThemePicker.module.css";

export default function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className={styles.picker} aria-label="Theme">
      {(["Light", "Dark"] as const).map((group) => (
        <section
          className={styles.group}
          key={group}
          aria-label={`${group} themes`}
        >
          <h3>{group}</h3>
          <div className={styles.options}>
            {THEMES.filter((theme) => theme.group === group).map((theme) => (
              <label className={styles.option} key={theme.id}>
                <input
                  type="radio"
                  name="appearance"
                  value={theme.id}
                  checked={value === theme.id}
                  onChange={() => onChange(theme.id)}
                />
                <span className={styles.card}>
                  <span
                    className={styles.swatch}
                    aria-hidden="true"
                    style={{
                      background: theme.swatch[0],
                      borderColor: theme.swatch[1],
                      color: theme.swatch[2],
                    }}
                  />
                  <span>{theme.label}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </fieldset>
  );
}
