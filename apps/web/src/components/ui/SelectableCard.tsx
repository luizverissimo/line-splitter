import type { ReactNode } from 'react';

interface Props {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/** Cartão de seleção única (radio nativo estilizado: teclado e leitores de tela funcionam por padrão). */
export function SelectableCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  icon,
  disabled,
}: Props) {
  return (
    <label className={`selectable-card${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}`}>
      <input
        type="radio"
        className="sr-only"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
      />
      {icon && (
        <span className="selectable-card-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="selectable-card-title">{title}</span>
      {description && <span className="selectable-card-description">{description}</span>}
    </label>
  );
}
