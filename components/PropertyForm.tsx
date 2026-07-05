'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Property } from '@/lib/types';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';
import { CurrencyInput } from '@/components/CurrencyInput';

type ChargeMode = 'indefinite' | 'period';

export function PropertyForm({ property }: { property?: Property }) {
  const router = useRouter();
  const isEditing = Boolean(property);

  const [form, setForm] = useState({
    name: property?.name ?? '',
    address: property?.address ?? '',
    code: property?.code ?? '',
    iptuCode: property?.iptuCode ?? '',
    energyCode: property?.energyCode ?? '',
    managementCompany: property?.managementCompany ?? '',
    monthlyIptu: String(property?.monthlyIptu ?? 0),
    monthlyInsurance: String(property?.monthlyInsurance ?? 0),
    condoFee: String(property?.condoFee ?? 0),

    // ── IPTU: quantidade de meses + mês de início da cobrança ──────────────
    // O IPTU normalmente é parcelado em 10 meses por ano.
    iptuChargeMonths: String(property?.iptuChargeMonths ?? 10),
    iptuChargeStartMonth: property?.iptuChargeStartMonth ?? '',

    // ── Fundo de reserva (refundFee): indefinido OU por N meses ────────────
    refundFee: String(property?.refundFee ?? 0),
    refundFeeMode: (property?.refundFeeChargeMonths != null ? 'period' : 'indefinite') as ChargeMode,
    refundFeeChargeMonths: String(property?.refundFeeChargeMonths ?? 12),
    refundFeeChargeStartMonth: property?.refundFeeChargeStartMonth ?? '',

    // ── Outras taxas extras no condomínio (novo): indefinido OU N meses ────
    extraCondoFee: String(property?.extraCondoFee ?? 0),
    extraCondoFeeMode: (property?.extraCondoFeeChargeMonths != null ? 'period' : 'indefinite') as ChargeMode,
    extraCondoFeeChargeMonths: String(property?.extraCondoFeeChargeMonths ?? 12),
    extraCondoFeeChargeStartMonth: property?.extraCondoFeeChargeStartMonth ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        code: form.code,
        iptuCode: form.iptuCode,
        energyCode: form.energyCode,
        managementCompany: form.managementCompany,
        monthlyInsurance: parseFloat(form.monthlyInsurance) || 0,
        condoFee: parseFloat(form.condoFee) || 0,

        // IPTU + período de cobrança (sem mês de início = cobra todo mês, legado)
        monthlyIptu: parseFloat(form.monthlyIptu) || 0,
        iptuChargeMonths: parseInt(form.iptuChargeMonths, 10) || null,
        iptuChargeStartMonth: form.iptuChargeStartMonth || null,

        // Fundo de reserva: months = null significa "indefinido"
        refundFee: parseFloat(form.refundFee) || 0,
        refundFeeChargeMonths:
          form.refundFeeMode === 'period' ? parseInt(form.refundFeeChargeMonths, 10) || null : null,
        refundFeeChargeStartMonth:
          form.refundFeeMode === 'period' ? form.refundFeeChargeStartMonth || null : null,

        // Outras taxas extras no condomínio: mesmo conceito
        extraCondoFee: parseFloat(form.extraCondoFee) || 0,
        extraCondoFeeChargeMonths:
          form.extraCondoFeeMode === 'period' ? parseInt(form.extraCondoFeeChargeMonths, 10) || null : null,
        extraCondoFeeChargeStartMonth:
          form.extraCondoFeeMode === 'period' ? form.extraCondoFeeChargeStartMonth || null : null,
      };

      if (isEditing && property) {
        await updateDoc(doc(db, 'properties', property.id), payload);
      } else {
        await addDoc(collection(db, 'properties'), payload);
      }
      router.push('/properties');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!property) return;
    if (!confirm(`Excluir o imóvel "${property.name}"? Essa ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'properties', property.id));
      router.push('/properties');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <div>
        <label className={labelClass}>Nome do imóvel</label>
        <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} required />
      </div>

      <div>
        <label className={labelClass}>Endereço</label>
        <input className={inputClass} value={form.address} onChange={(e) => update('address', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Código</label>
          <input className={inputClass} value={form.code} onChange={(e) => update('code', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Código IPTU</label>
          <input className={inputClass} value={form.iptuCode} onChange={(e) => update('iptuCode', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Código Enel</label>
          <input className={inputClass} value={form.energyCode} onChange={(e) => update('energyCode', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Administradora</label>
        <input
          className={inputClass}
          value={form.managementCompany}
          onChange={(e) => update('managementCompany', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Taxa condominial mensal</label>
          <CurrencyInput className={inputClass} value={form.condoFee} onChange={(v) => update('condoFee', v)} />
        </div>
        <div>
          <label className={labelClass}>Seguro mensal</label>
          <CurrencyInput
            className={inputClass}
            value={form.monthlyInsurance}
            onChange={(v) => update('monthlyInsurance', v)}
          />
        </div>
      </div>

      {/* ── IPTU mensal + período de cobrança ─────────────────────────────── */}
      <div className="rounded-md border border-hairline bg-paperDim/40 p-4">
        <p className={labelClass}>IPTU mensal</p>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Valor mensal</label>
            <CurrencyInput className={inputClass} value={form.monthlyIptu} onChange={(v) => update('monthlyIptu', v)} />
          </div>
          <div>
            <label className={labelClass}>Meses de cobrança</label>
            <input
              type="number"
              min={1}
              max={12}
              className={inputClass}
              value={form.iptuChargeMonths}
              onChange={(e) => update('iptuChargeMonths', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Mês de início</label>
            <input
              type="month"
              className={inputClass}
              value={form.iptuChargeStartMonth}
              onChange={(e) => update('iptuChargeStartMonth', e.target.value)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate">
          O IPTU normalmente é cobrado em 10 parcelas por ano. O boleto só recebe o valor de IPTU quando o mês de
          referência estiver dentro do período (início + quantidade de meses). Sem mês de início, é cobrado em todos
          os meses, como antes.
        </p>
      </div>

      {/* ── Fundo de reserva (taxa de reembolso) + período de cobrança ────── */}
      <div className="rounded-md border border-hairline bg-paperDim/40 p-4">
        <p className={labelClass}>Fundo de reserva (taxa de reembolso — desconto)</p>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Valor mensal</label>
            <CurrencyInput className={inputClass} value={form.refundFee} onChange={(v) => update('refundFee', v)} />
          </div>
          <div>
            <label className={labelClass}>Prazo de cobrança</label>
            <select
              className={inputClass}
              value={form.refundFeeMode}
              onChange={(e) => update('refundFeeMode', e.target.value as ChargeMode)}
            >
              <option value="indefinite">Indefinido (todo mês)</option>
              <option value="period">Por quantidade de meses</option>
            </select>
          </div>
          {form.refundFeeMode === 'period' && (
            <>
              <div>
                <label className={labelClass}>Meses de cobrança</label>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={form.refundFeeChargeMonths}
                  onChange={(e) => update('refundFeeChargeMonths', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Mês de início</label>
                <input
                  type="month"
                  className={inputClass}
                  value={form.refundFeeChargeStartMonth}
                  onChange={(e) => update('refundFeeChargeStartMonth', e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Outras taxas extras no condomínio (novo) ──────────────────────── */}
      <div className="rounded-md border border-hairline bg-paperDim/40 p-4">
        <p className={labelClass}>Outras taxas extras no condomínio</p>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Valor mensal</label>
            <CurrencyInput
              className={inputClass}
              value={form.extraCondoFee}
              onChange={(v) => update('extraCondoFee', v)}
            />
          </div>
          <div>
            <label className={labelClass}>Prazo de cobrança</label>
            <select
              className={inputClass}
              value={form.extraCondoFeeMode}
              onChange={(e) => update('extraCondoFeeMode', e.target.value as ChargeMode)}
            >
              <option value="indefinite">Indefinido (todo mês)</option>
              <option value="period">Por quantidade de meses</option>
            </select>
          </div>
          {form.extraCondoFeeMode === 'period' && (
            <>
              <div>
                <label className={labelClass}>Meses de cobrança</label>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={form.extraCondoFeeChargeMonths}
                  onChange={(e) => update('extraCondoFeeChargeMonths', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Mês de início</label>
                <input
                  type="month"
                  className={inputClass}
                  value={form.extraCondoFeeChargeStartMonth}
                  onChange={(e) => update('extraCondoFeeChargeStartMonth', e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-slate">
          Ex.: taxa extra aprovada em assembleia (obra, rateio). Entra no boleto como "Taxa extra" enquanto o mês de
          referência estiver dentro do prazo de cobrança.
        </p>
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => router.push('/properties')} className={secondaryButtonClass}>
          Cancelar
        </button>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={saving} className={`ml-auto ${dangerLinkClass}`}>
            Excluir imóvel
          </button>
        )}
      </div>
    </form>
  );
}