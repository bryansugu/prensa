"use client";

import { Select as Base } from "@base-ui/react/select";
import { FieldFrame, fieldShell, fieldSizes, type FieldShellProps, type FieldSize } from "./input";

/**
 * Select — portado de los sets FDS "Select", "Multi-select", "Menu" y
 * ".Menu item". El trigger es un campo neutro (mismos tokens y altos que
 * Input); el popover es el Menu:
 *   menu: bg/elevated + border/default + Elevation/lg · radius-md · padding 4
 *   item: alto 32 (sm) / 36 (md-lg) · radius-sm · resaltado bg/surface
 *   elegido: check primary/accent (single) o caja marcada (multiple)
 * En Figma son dos componentes (Select / Multi-select); en código es uno con
 * la prop `multiple`. Teclado, typeahead, portal y posicionamiento: Base UI.
 */
export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface CommonProps extends FieldShellProps {
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  /** Nombre accesible cuando no hay label visible */
  "aria-label"?: string;
}

interface SingleProps extends CommonProps {
  multiple?: false;
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
}

interface MultipleProps extends CommonProps {
  multiple: true;
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

export type SelectProps = SingleProps | MultipleProps;

const Chevron = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.667" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m5 7.5 5 5 5-5" />
  </svg>
);

const Check = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

const itemSize: Record<FieldSize, string> = {
  sm: "min-h-8 px-2 text-sm",
  md: "min-h-9 px-2.5 text-sm",
  lg: "min-h-9 px-2.5 text-md",
};

export function Select(props: SelectProps) {
  const { size = "md", label, hint, error, className, options, placeholder = "Seleccionar", required, disabled, name, multiple } = props;
  const s = fieldSizes[size];
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} disabled={disabled} className={className}>
      <Base.Root
        items={options}
        multiple={multiple}
        value={props.value as never}
        defaultValue={props.defaultValue as never}
        onValueChange={props.onValueChange as never}
        name={name}
        required={required}
        disabled={disabled}
      >
        <Base.Trigger
          aria-label={props["aria-label"]}
          className={`${fieldShell} ${s.box} ${s.text} ${s.icon} cursor-default justify-between text-left outline-none select-none data-popup-open:border-focus-ring data-popup-open:shadow-[0_0_0_2px_var(--focus-ring)] data-invalid:border-danger-accent data-invalid:focus-visible:shadow-[0_0_0_2px_var(--danger-border-strong)] data-disabled:cursor-not-allowed data-disabled:bg-bg-subtle data-disabled:text-fg-disabled data-disabled:shadow-none data-disabled:hover:border-border`}
        >
          <Base.Value className="min-w-0 truncate data-placeholder:text-fg-subtle" placeholder={placeholder}>
            {multiple
              ? (value: string[]) =>
                  value.length === 0 ? placeholder : value.length <= 2 ? value.map(labelOf).join(", ") : `${value.length} seleccionadas`
              : undefined}
          </Base.Value>
          <Base.Icon className="flex shrink-0 text-icon-subtle transition-transform duration-(--ds-duration-fast) data-popup-open:rotate-180 motion-reduce:transition-none">
            <Chevron />
          </Base.Icon>
        </Base.Trigger>
        <Base.Portal>
          <Base.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-50 outline-none select-none">
            <Base.Popup className="max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-md border border-border bg-bg-elevated p-1 shadow-lg outline-none transition-[opacity,scale] duration-(--ds-duration-instant) ease-enter data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none">
              <Base.List>
                {options.map((option) => (
                  <Base.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={`flex cursor-default items-center gap-2 rounded-sm py-1.5 text-fg outline-none select-none data-highlighted:bg-surface data-disabled:text-fg-disabled ${itemSize[size]}`}
                  >
                    {multiple && (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-xs border border-border bg-bg-elevated text-primary-fg in-data-selected:border-transparent in-data-selected:bg-primary [&_svg]:size-3">
                        <Base.ItemIndicator className="flex">
                          <Check />
                        </Base.ItemIndicator>
                      </span>
                    )}
                    <Base.ItemText className="min-w-0 flex-1 truncate">{option.label}</Base.ItemText>
                    {!multiple && (
                      <Base.ItemIndicator className="flex shrink-0 text-primary-accent [&_svg]:size-4">
                        <Check />
                      </Base.ItemIndicator>
                    )}
                  </Base.Item>
                ))}
              </Base.List>
            </Base.Popup>
          </Base.Positioner>
        </Base.Portal>
      </Base.Root>
    </FieldFrame>
  );
}
