'use client';

/* Shared UI primitives for onboarding steps */

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-gray-700 mb-1"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {children}
    </label>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#4abd98] focus:ring-2 focus:ring-[#4abd98]/20 placeholder:text-gray-400"
      style={{ fontFamily: 'Inter, sans-serif', color: '#1d1d1f' }}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#4abd98] focus:ring-2 focus:ring-[#4abd98]/20 placeholder:text-gray-400 resize-none"
      style={{ fontFamily: 'Inter, sans-serif', color: '#1d1d1f' }}
    />
  );
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#4abd98] focus:ring-2 focus:ring-[#4abd98]/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23424245%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat"
      style={{ fontFamily: 'Inter, sans-serif', color: value ? '#1d1d1f' : '#9ca3af' }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt} value={opt} style={{ color: '#1d1d1f' }}>
          {opt}
        </option>
      ))}
    </select>
  );
}
