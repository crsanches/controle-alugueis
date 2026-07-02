'use client';

import { useEffect, useState } from 'react';

interface CurrencyInputProps {
  value: string; // valor numérico como string, ex: "1500.5"
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

// Trabalha internamente em centavos (número inteiro). Isso resolve de
// uma vez os três problemas: zero sobrando à esquerda, vírgula não
// aceita, e formatação em moeda — o dígito digitado sempre entra pela
// direita, empurrando os centavos, do jeito que uma calculadora funciona.
function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CurrencyInput({ value, onChange, className, required }: CurrencyInputProps) {
  const [cents, setCents] = useState(() => Math.round((parseFloat(value) || 0) * 100));

  // sincroniza se o valor externo mudar (ex: autopreenchido a partir do contrato)
  useEffect(() => {
    setCents(Math.round((parseFloat(value) || 0) * 100));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    const newCents = digitsOnly === '' ? 0 : parseInt(digitsOnly, 10);
    setCents(newCents);
    onChange((newCents / 100).toString());
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={centsToDisplay(cents)}
      onChange={handleChange}
      required={required}
    />
  );
}
