'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AdjustmentEntry, Contract, HistoryEntry, Property, Tenant } from '@/lib/types';
import { timestampToDateInput, dateInputToTimestamp, formatDate, formatCurrency } from '@/lib/format';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';
import { CurrencyInput } from '@/components/CurrencyInput';

const RENEWAL_MONTHS = 30;

function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatInputDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function ordinalPtBr(n: number): string {
  const names = [
    'Primeira', 'Segunda', 'Terceira', 'Quarta', 'Quinta',
    'Sexta', 'Sétima', 'Oitava', 'Nona', 'Décima',
  ];
  return names[n - 1] ?? `${n}ª`;
}

interface TimelineRow {
  title: string;
  detail: string;
}

/**
 * Deduz a linha do tempo de renovações a partir do início e do fim do
 * contrato, assumindo ciclos fixos de 30 meses. Não depende da coleção
 * `history` — o log lá é apenas informativo.
 */
function buildTimeline(startDate: string, endDate: string) {
  const rows: TimelineRow[] = [];
  if (!startDate) return { rows, aligned: true, renewals: 0 };

  const firstDue = addMonths(startDate, RENEWAL_MONTHS);
  rows.push({
    title: 'Contrato inicial',
    detail: `${formatInputDate(startDate)} — 1º vencimento: ${formatInputDate(firstDue)}`,
  });

  let cursor = firstDue;
  let renewals = 0;

  if (endDate) {
    // Cada renovação acontece na data do vencimento anterior e empurra o fim
    // do contrato +30 meses. Strings ISO (yyyy-mm-dd) comparam corretamente.
    while (renewals < 40) {
      const next = addMonths(cursor, RENEWAL_MONTHS);
      if (next <= endDate) {
        renewals += 1;
        rows.push({
          title: `${ordinalPtBr(renewals)} renovação — ${formatInputDate(cursor)}`,
          detail: `Próximo vencimento: ${formatInputDate(next)}`,
        });
        cursor = next;
      } else {
        break;
      }
    }
  }

  const aligned = !endDate || endDate === cursor;
  return { rows, aligned, renewals };
}

export function ContractForm({ contract }: { contract?: Contract }) {
  const router = useRouter();
  const isEditing = Boolean(contract);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [form, setForm] = useState({
    tenantId: contract?.tenantId ?? '',
    propertyId: contract?.propertyId ?? '',
    startDate: timestampToDateInput(contract?.startDate),
    endDate: timestampToDateInput(contract?.endDate),
    dueDay: String(contract?.dueDay ?? ''),
    rentValue: String(contract?.rentValue ?? 0),
    currentRentValue: String(contract?.currentRentValue ?? 0),
    adjustmentType: contract?.adjustmentType ?? 'IGPM',
    nextAdjustmentDate: timestampToDateInput(contract?.nextAdjustmentDate),
    collectsIncomeTax: contract?.collectsIncomeTax ?? false,
    collectsIptu: contract?.collectsIptu ?? true,
    status: contract?.status === 'inactive' ? 'inactive' : 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Reajustes ────────────────────────────────────────────────────────────
  // Existentes agora vivem em estado para permitir exclusão (persistida ao Salvar)
  const [existingAdjustments, setExistingAdjustments] = useState<AdjustmentEntry[]>(
    contract?.adjustmentHistory ?? []
  );
  const [pendingAdjustments, setPendingAdjustments] = useState<{ date: string; value: string }[]>([]);
  const [newAdjustmentDate, setNewAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [newAdjustmentValue, setNewAdjustmentValue] = useState('0');

  /**
   * O "Valor atual do aluguel" é sempre o valor do reajuste com a DATA MAIS
   * RECENTE entre existentes + pendentes. Recalculado a cada inclusão/exclusão.
   */
  function latestAdjustmentValue(
    existing: AdjustmentEntry[],
    pending: { date: string; value: string }[]
  ): string | null {
    const all = [
      ...existing.map((a) => ({ ms: a.date?.toMillis() ?? 0, value: String(a.value) })),
      ...pending.map((a) => ({ ms: new Date(`${a.date}T00:00:00.000Z`).getTime(), value: a.value })),
    ];
    if (all.length === 0) return null;
    all.sort((x, y) => y.ms - x.ms);
    return all[0].value;
  }

  function syncCurrentRent(
    existing: AdjustmentEntry[],
    pending: { date: string; value: string }[]
  ) {
    const latest = latestAdjustmentValue(existing, pending);
    if (latest !== null) {
      update('currentRentValue', latest);
    } else {
      // sem nenhum reajuste, o valor atual volta a ser o valor original
      update('currentRentValue', form.rentValue);
    }
  }

  function handleAddAdjustment() {
    const value = parseFloat(newAdjustmentValue) || 0;
    if (!newAdjustmentDate || value <= 0) return;

    const nextPending = [...pendingAdjustments, { date: newAdjustmentDate, value: newAdjustmentValue }];
    setPendingAdjustments(nextPending);
    syncCurrentRent(existingAdjustments, nextPending);

    setNewAdjustmentDate(new Date().toISOString().slice(0, 10));
    setNewAdjustmentValue('0');
  }

  function handleRemovePendingAdjustment(index: number) {
    const nextPending = pendingAdjustments.filter((_, i) => i !== index);
    setPendingAdjustments(nextPending);
    syncCurrentRent(existingAdjustments, nextPending);
  }

  function handleRemoveExistingAdjustment(index: number) {
    if (!confirm('Excluir este reajuste do histórico? A exclusão é gravada ao clicar em "Salvar".')) return;
    const nextExisting = existingAdjustments.filter((_, i) => i !== index);
    setExistingAdjustments(nextExisting);
    syncCurrentRent(nextExisting, pendingAdjustments);
  }

  // ─── Renovações (ciclo fixo de 30 meses) ─────────────────────────────────
  const [renewalHistory, setRenewalHistory] = useState<HistoryEntry[]>([]);
  const [earlyEndDate, setEarlyEndDate] = useState('');

  const timeline = buildTimeline(form.startDate, form.endDate);
  const firstDue = form.startDate ? addMonths(form.startDate, RENEWAL_MONTHS) : '';

  function handleRegisterRenewal() {
    // renovação padrão: empurra o fim do contrato +30 meses a partir do fim atual
    const base = form.endDate || firstDue;
    if (!base) return;
    update('endDate', addMonths(base, RENEWAL_MONTHS));
  }

  function handleUndoLastRenewal() {
    if (!timeline.aligned || timeline.renewals === 0) return;
    update('endDate', addMonths(form.endDate, -RENEWAL_MONTHS));
  }

  function handleApplyEarlyEnd() {
    if (!earlyEndDate) return;
    update('endDate', earlyEndDate);
    setEarlyEndDate('');
  }

  const renewalPending = isEditing && contract && form.endDate !== timestampToDateInput(contract.endDate);

  async function handleDeleteRenewalEntry(entry: HistoryEntry) {
    if (!confirm(`Excluir do histórico o registro de renovação de ${formatDate(entry.date)}? Essa ação é imediata e não pode ser desfeita.`)) return;
    try {
      await deleteDoc(doc(db, 'history', entry.id));
      setRenewalHistory((list) => list.filter((h) => h.id !== entry.id));
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir o registro do histórico.');
    }
  }

  useEffect(() => {
    async function loadOptions() {
      const [tenantsSnap, propertiesSnap] = await Promise.all([
        getDocs(query(collection(db, 'tenants'), orderBy('name', 'asc'))),
        getDocs(query(collection(db, 'properties'), orderBy('name', 'asc'))),
      ]);
      setTenants(tenantsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tenant));
      setProperties(propertiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Property));
      setLoadingOptions(false);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    async function loadRenewalHistory() {
      if (!isEditing || !contract) return;
      const snap = await getDocs(
        query(collection(db, 'history'), where('contractId', '==', contract.id), where('type', '==', 'renewal'))
      );
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as HistoryEntry)
        .sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));
      setRenewalHistory(rows);
    }
    loadRenewalHistory();
  }, [isEditing, contract]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tenant = tenants.find((t) => t.id === form.tenantId);
      const property = properties.find((p) => p.id === form.propertyId);

      if (!tenant || !property) {
        setError('Selecione um inquilino e um imóvel válidos.');
        setSaving(false);
        return;
      }

      const newAdjustmentEntries = pendingAdjustments.map((a) => ({
        date: dateInputToTimestamp(a.date),
        value: parseFloat(a.value) || 0,
      }));

      const payload = {
        tenantId: form.tenantId,
        tenantName: tenant.name,
        propertyId: form.propertyId,
        propertyName: property.name,
        startDate: dateInputToTimestamp(form.startDate),
        endDate: dateInputToTimestamp(form.endDate),
        dueDay: parseInt(form.dueDay, 10) || null,
        rentValue: parseFloat(form.rentValue) || 0,
        currentRentValue: parseFloat(form.currentRentValue) || 0,
        adjustmentType: form.adjustmentType,
        nextAdjustmentDate: dateInputToTimestamp(form.nextAdjustmentDate),
        collectsIncomeTax: form.collectsIncomeTax,
        collectsIptu: form.collectsIptu,
        status: form.status,
        // existentes (já sem os excluídos nesta sessão) + novos
        adjustmentHistory: [...existingAdjustments, ...newAdjustmentEntries],
      };

      if (isEditing && contract) {
        await updateDoc(doc(db, 'contracts', contract.id), payload);

        const previousEndDate = contract.endDate?.toDate();
        const newEndDate = payload.endDate?.toDate();

        // fim estendido → registra renovação no histórico
        if (previousEndDate && newEndDate && newEndDate.getTime() > previousEndDate.getTime()) {
          await addDoc(collection(db, 'history'), {
            contractId: contract.id,
            tenantName: tenant.name,
            propertyName: property.name,
            date: payload.endDate,
            type: 'renewal',
            note: `Contrato renovado. Novo vencimento: ${formatDate(payload.endDate)} (anterior: ${formatDate(contract.endDate)}).`,
          });
        }

        // fim antecipado/cancelado → registra também, como nota geral
        if (previousEndDate && newEndDate && newEndDate.getTime() < previousEndDate.getTime()) {
          await addDoc(collection(db, 'history'), {
            contractId: contract.id,
            tenantName: tenant.name,
            propertyName: property.name,
            date: payload.endDate,
            type: 'general',
            note: `Vencimento antecipado/cancelado. Novo fim: ${formatDate(payload.endDate)} (anterior: ${formatDate(contract.endDate)}).`,
          });
        }

        // registra cada reajuste novo no histórico também
        for (const entry of newAdjustmentEntries) {
          await addDoc(collection(db, 'history'), {
            contractId: contract.id,
            tenantName: tenant.name,
            propertyName: property.name,
            date: entry.date,
            type: 'adjustment',
            note: `Reajuste registrado. Novo valor do aluguel: ${formatCurrency(entry.value)}.`,
          });
        }
      } else {
        await addDoc(collection(db, 'contracts'), payload);
      }
      router.push('/contracts');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!contract) return;
    if (!confirm(`Excluir o contrato de "${contract.tenantName}"? Essa ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'contracts', contract.id));
      router.push('/contracts');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir.');
      setSaving(false);
    }
  }

  if (loadingOptions) return <p className="text-slate">Carregando...</p>;

  // reajustes existentes ordenados por data desc, preservando o índice real
  // do array para permitir a exclusão correta
  const sortedExistingAdjustments = existingAdjustments
    .map((a, originalIndex) => ({ a, originalIndex }))
    .sort((x, y) => (y.a.date?.toMillis() ?? 0) - (x.a.date?.toMillis() ?? 0));

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Inquilino</label>
          <select className={inputClass} value={form.tenantId} onChange={(e) => update('tenantId', e.target.value)} required>
            <option value="">Selecione...</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Imóvel</label>
          <select className={inputClass} value={form.propertyId} onChange={(e) => update('propertyId', e.target.value)} required>
            <option value="">Selecione...</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Início do contrato</label>
          <input type="date" className={inputClass} value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Fim do contrato</label>
          <input type="date" className={inputClass} value={form.endDate} onChange={(e) => update('endDate', e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Dia de vencimento</label>
          <input
            type="number"
            min={1}
            max={31}
            className={inputClass}
            value={form.dueDay}
            onChange={(e) => update('dueDay', e.target.value)}
            placeholder="Ex: 15"
          />
        </div>
      </div>

      {isEditing && (
        <div className="rounded-md border border-hairline bg-paperDim/40 p-4">
          <p className={labelClass}>Renovações — ciclo de {RENEWAL_MONTHS} meses</p>

          {/* Linha do tempo calculada a partir de Início + Fim do contrato */}
          {timeline.rows.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {timeline.rows.map((row, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-4 border-b border-hairline/70 py-1.5">
                  <span>{row.title}</span>
                  <span className="text-slate">{row.detail}</span>
                </li>
              ))}
            </ul>
          )}

          {!timeline.aligned && form.endDate && (
            <p className="mt-2 rounded-md bg-rust/10 px-3 py-2 text-sm text-rust">
              Vencimento atual fora do ciclo de {RENEWAL_MONTHS} meses (antecipação ou cancelamento):{' '}
              {formatInputDate(form.endDate)}
            </p>
          )}

          {renewalPending && (
            <p className="mt-2 rounded-md bg-sage/10 px-3 py-2 text-sm text-sage">
              Alteração pendente: vencimento passa a {formatDate(dateInputToTimestamp(form.endDate))} — será gravada
              ao clicar em "Salvar".
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRegisterRenewal}
              className="border border-ink px-4 py-2 text-sm text-ink hover:bg-ink hover:text-paper"
            >
              + Registrar novo vencimento (+{RENEWAL_MONTHS} meses)
            </button>
            {timeline.aligned && timeline.renewals > 0 && (
              <button
                type="button"
                onClick={handleUndoLastRenewal}
                className={dangerLinkClass}
              >
                Desfazer última renovação
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className={labelClass}>Informe o novo vencimento caso seja antecipado ou cancelado</label>
              <input
                type="date"
                className={inputClass}
                value={earlyEndDate}
                onChange={(e) => setEarlyEndDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={handleApplyEarlyEnd}
              disabled={!earlyEndDate}
              className="border border-ink px-4 py-2 text-sm text-ink hover:bg-ink hover:text-paper disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>

          <p className="mt-2 text-xs text-slate">
            A linha do tempo acima é calculada automaticamente a partir do início e do fim do contrato (ciclos de{' '}
            {RENEWAL_MONTHS} meses). As alterações no vencimento são gravadas ao clicar em "Salvar" no final do
            formulário.
          </p>

          {/* Registros gravados na coleção history — apenas informativos, com exclusão */}
          {renewalHistory.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate">
                Registros de renovação no Histórico
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {renewalHistory.map((h) => (
                  <li key={h.id} className="flex items-center justify-between border-b border-hairline/70 py-1.5">
                    <span>{formatDate(h.date)}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-slate">novo vencimento registrado</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteRenewalEntry(h)}
                        className="text-xs text-rust hover:underline"
                      >
                        excluir
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate">
                Estes registros são apenas informativos — excluir um deles não altera o fim do contrato.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Valor original do contrato</label>
          <CurrencyInput className={inputClass} value={form.rentValue} onChange={(v) => update('rentValue', v)} />
        </div>
        <div>
          <label className={labelClass}>Valor atual do aluguel</label>
          <CurrencyInput
            className={inputClass}
            value={form.currentRentValue}
            onChange={(v) => update('currentRentValue', v)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Índice de reajuste</label>
          <select className={inputClass} value={form.adjustmentType} onChange={(e) => update('adjustmentType', e.target.value)}>
            <option value="IGPM">IGP-M</option>
            <option value="IPCA">IPCA</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Próximo reajuste</label>
          <input
            type="date"
            className={inputClass}
            value={form.nextAdjustmentDate}
            onChange={(e) => update('nextAdjustmentDate', e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-8">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.collectsIptu}
            onChange={(e) => update('collectsIptu', e.target.checked)}
          />
          Recolhe IPTU
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.collectsIncomeTax}
            onChange={(e) => update('collectsIncomeTax', e.target.checked)}
          />
          Recolhe Imposto de Renda
        </label>
      </div>

      {isEditing && (
        <div className="rounded-md border border-hairline bg-paperDim/40 p-4">
          <p className={labelClass}>Histórico de reajustes</p>

          {existingAdjustments.length === 0 && pendingAdjustments.length === 0 && (
            <p className="mt-2 text-sm text-slate">Nenhum reajuste registrado ainda.</p>
          )}

          {(existingAdjustments.length > 0 || pendingAdjustments.length > 0) && (
            <ul className="mt-2 space-y-1 text-sm">
              {sortedExistingAdjustments.map(({ a, originalIndex }) => (
                <li key={`existing-${originalIndex}`} className="flex items-center justify-between border-b border-hairline/70 py-1.5">
                  <span>{formatDate(a.date)}</span>
                  <span className="flex items-center gap-3">
                    <span className="money">{formatCurrency(a.value)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingAdjustment(originalIndex)}
                      className="text-xs text-rust hover:underline"
                    >
                      excluir
                    </button>
                  </span>
                </li>
              ))}
              {pendingAdjustments.map((a, i) => (
                <li
                  key={`pending-${i}`}
                  className="flex items-center justify-between border-b border-hairline/70 py-1.5 text-sage"
                >
                  <span>{new Date(a.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} (novo)</span>
                  <span className="flex items-center gap-3">
                    <span className="money">{formatCurrency(parseFloat(a.value) || 0)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePendingAdjustment(i)}
                      className="text-xs text-rust hover:underline"
                    >
                      remover
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
            <div>
              <label className={labelClass}>Data do reajuste</label>
              <input
                type="date"
                className={inputClass}
                value={newAdjustmentDate}
                onChange={(e) => setNewAdjustmentDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Novo valor do aluguel</label>
              <CurrencyInput className={inputClass} value={newAdjustmentValue} onChange={setNewAdjustmentValue} />
            </div>
            <button
              type="button"
              onClick={handleAddAdjustment}
              className="border border-ink px-4 py-2 text-sm text-ink hover:bg-ink hover:text-paper"
            >
              + Adicionar reajuste
            </button>
          </div>
          <p className="mt-2 text-xs text-slate">
            O "Valor atual do aluguel" acima acompanha sempre o reajuste de data mais recente. Inclusões e exclusões
            são gravadas ao clicar em "Salvar" no final do formulário.
          </p>
        </div>
      )}

      <div>
        <label className={labelClass}>Status</label>
        <select className={inputClass} value={form.status} onChange={(e) => update('status', e.target.value)}>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => router.push('/contracts')} className={secondaryButtonClass}>
          Cancelar
        </button>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={saving} className={`ml-auto ${dangerLinkClass}`}>
            Excluir contrato
          </button>
        )}
      </div>
    </form>
  );
}