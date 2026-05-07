import { MATERIALS } from "../../engine/materials";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}

export function MaterialPicker({ value, onChange, disabled }: Props) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      style={{ width: "100%", padding: 6 }}
    >
      <option value="">Inherit</option>
      {MATERIALS.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}
