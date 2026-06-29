interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}

/**
 * Controlled tab switcher wrapping the existing .tab-group/.tab/.tab-active
 * CSS classes. Every screen with tabs used to re-implement this same
 * map-over-tuple-with-manual-active-classes pattern by hand.
 */
export function Tabs<T extends string>({ items, active, onChange, disabled }: TabsProps<T>) {
  return (
    <div className="tab-group">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          disabled={disabled}
          className={`tab ${active === item.id ? 'tab-active' : ''}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
