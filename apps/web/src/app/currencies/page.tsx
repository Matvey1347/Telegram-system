'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { currenciesApi, Currency, CurrencyDisplayMode, ExchangeRate } from '@/lib/api';
import { Button, Card, ConfirmDeleteModal, DateInput, EmptyState, EntityCard, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';

type RateValues = { baseCurrency: Currency; targetCurrency: Currency; rate: number; date: string; source?: string };

const n = (value: number | null | undefined) => (value ?? 0).toFixed(4);

export default function CurrenciesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [deleting, setDeleting] = useState<ExchangeRate | null>(null);

  const { data: settings, isLoading: loadingSettings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates, isLoading: loadingRates, error } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });

  const saveSettings = useMutation({
    mutationFn: currenciesApi.updateSettings,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['currency-settings'] }),
        qc.invalidateQueries({ queryKey: ['currency-rates'] }),
        qc.invalidateQueries({ queryKey: ['accounts'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });
  const updateRate = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => currenciesApi.updateRate(id, payload),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
    },
  });
  const deleteRate = useMutation({
    mutationFn: currenciesApi.removeRate,
    onSuccess: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
    },
  });

  return (
    <AppShell>
      <PageHeader
        title="Currencies"
        subtitle="Configure primary/secondary currencies and exchange rates"
      />

      {loadingSettings || loadingRates ? <LoadingState /> : null}
      {error ? <Card className="text-red-300">Failed to load currency data</Card> : null}

      {settings ? <CurrencySettingsCard key={`${settings.primaryCurrency}-${settings.secondaryCurrency}-${settings.currencyDisplayMode}`} settings={settings} onSave={(payload) => saveSettings.mutate(payload)} /> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rates?.map((rate) => (
          <EntityCard
            key={rate.id}
            title={`${rate.baseCurrency} -> ${rate.targetCurrency}`}
            actions={
              <div className="flex gap-2">
                <IconButton onClick={() => setEditing(rate)} />
                <IconButton kind="delete" onClick={() => setDeleting(rate)} />
              </div>
            }
          >
            <p>Rate: {n(Number(rate.rate))}</p>
            <p>Date: {new Date(rate.date).toLocaleDateString()}</p>
            <p>Source: {rate.source || 'manual'}</p>
          </EntityCard>
        ))}
      </div>
      {!loadingRates && !rates?.length ? <EmptyState text="No exchange rates yet." /> : null}

      <RateModal open={!!editing} title="Edit Exchange Rate" initial={editing ?? undefined} currencies={settings?.supportedCurrencies ?? ['USD', 'UAH', 'EUR', 'PLN']} onClose={() => setEditing(null)} onSubmit={(v) => editing && updateRate.mutate({ id: editing.id, payload: v })} />
      <ConfirmDeleteModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteRate.mutate(deleting.id)} entityName={`${deleting?.baseCurrency}->${deleting?.targetCurrency}`} />
    </AppShell>
  );
}

function CurrencySettingsCard({ settings, onSave }: { settings: { primaryCurrency: Currency; secondaryCurrency: Currency; currencyDisplayMode: CurrencyDisplayMode; supportedCurrencies: Currency[] }; onSave: (v: { primaryCurrency: Currency; secondaryCurrency: Currency; currencyDisplayMode: CurrencyDisplayMode }) => void }) {
  const [primaryCurrency, setPrimaryCurrency] = useState<Currency>(settings.primaryCurrency);
  const [secondaryCurrency, setSecondaryCurrency] = useState<Currency>(settings.secondaryCurrency);
  const [currencyDisplayMode, setCurrencyDisplayMode] = useState<CurrencyDisplayMode>(settings.currencyDisplayMode);

  return (
    <Card>
      <h3 className="mb-4 text-lg font-semibold">Currency settings</h3>
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ primaryCurrency: primaryCurrency.toUpperCase(), secondaryCurrency: secondaryCurrency.toUpperCase(), currencyDisplayMode });
        }}
      >
        <FormField label="Primary currency">
          <CurrencySelect value={primaryCurrency} onChange={setPrimaryCurrency} currencies={settings.supportedCurrencies} />
        </FormField>
        <FormField label="Secondary currency">
          <CurrencySelect value={secondaryCurrency} onChange={setSecondaryCurrency} currencies={settings.supportedCurrencies} />
        </FormField>
        <FormField label="Display">
          <Select value={currencyDisplayMode} onChange={(e) => setCurrencyDisplayMode(e.target.value as CurrencyDisplayMode)}>
            <option value="code">Code</option>
            <option value="symbol">Symbol</option>
          </Select>
        </FormField>
        <div className="flex items-end">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}

function CurrencySelect({ value, onChange, currencies }: { value: string; onChange: (value: string) => void; currencies: string[] }) {
  const options = Array.from(new Set([value, ...currencies].filter(Boolean))).sort();

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value.toUpperCase())}>
      {options.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
    </Select>
  );
}

function rateDefaults(initial?: ExchangeRate): RateValues {
  return initial
    ? {
        baseCurrency: initial.baseCurrency,
        targetCurrency: initial.targetCurrency,
        rate: Number(initial.rate),
        date: new Date(initial.date).toISOString().slice(0, 10),
        source: initial.source ?? 'manual',
      }
    : {
        baseCurrency: 'USD',
        targetCurrency: 'UAH',
        rate: 1,
        date: new Date().toISOString().slice(0, 10),
        source: 'manual',
      };
}

function RateModal({ open, onClose, onSubmit, title, initial, currencies }: { open: boolean; onClose: () => void; onSubmit: (v: RateValues) => void; title: string; initial?: ExchangeRate; currencies: Currency[] }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<RateValues>({
    defaultValues: rateDefaults(initial),
  });
  useEffect(() => {
    if (!open) return;
    reset(rateDefaults(initial));
  }, [open, initial, reset]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <FormField label="Base currency" required error={errors.baseCurrency ? 'Required field' : undefined}>
          <Input maxLength={3} list="rate-currency-codes" {...register('baseCurrency', { required: true, setValueAs: (value) => String(value).toUpperCase() })} />
        </FormField>
        <FormField label="Target currency" required error={errors.targetCurrency ? 'Required field' : undefined}>
          <Input maxLength={3} list="rate-currency-codes" {...register('targetCurrency', { required: true, setValueAs: (value) => String(value).toUpperCase() })} />
        </FormField>
        <datalist id="rate-currency-codes">
          {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </datalist>
        <FormField label="Rate">
          <Input type="number" step="0.0001" {...register('rate', { valueAsNumber: true })} />
        </FormField>
        <FormField label="Date" required error={errors.date ? 'Required field' : undefined}>
          <DateInput {...register('date', { required: true })} />
        </FormField>
        <FormField label="Source">
          <Input {...register('source')} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
