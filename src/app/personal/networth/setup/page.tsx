import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { FxRatesSection } from '../_components/setup/fx-rates-section';
import { LendersSection } from '../_components/setup/lenders-section';
import { SettingsForm } from '../_components/setup/settings-form';

export default function SetupPage() {
  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Net Worth"
        title="Setup"
        subtitle="FX rates, lenders, and personal settings."
      />
      <SettingsForm />
      <FxRatesSection />
      <LendersSection />
    </NetWorthShell>
  );
}
