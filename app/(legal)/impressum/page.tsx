import type { Metadata } from 'next'
import { LegalPage, Ph } from '@/components/legal/Template'

export const metadata: Metadata = { title: 'Impressum – Runmate' }

// Template (Phase 4): §5 DDG (Digitale-Dienste-Gesetz), §18 Abs. 2 MStV, §36 VSBG. Every value is a placeholder.
export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum" updated="02.11.2026">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        <Ph>Vor- und Nachname bzw. Firma (mit Rechtsform)</Ph><br />
        <Ph>Straße und Hausnummer (ladungsfähige Anschrift, kein Postfach)</Ph><br />
        <Ph>PLZ und Ort</Ph><br />
        Deutschland
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <Ph>E-Mail-Adresse für Anfragen</Ph><br />
        Telefon oder Kontaktformular: <Ph>zweiter schneller Kontaktweg, z. B. Telefonnummer</Ph>
      </p>

      <h2>Umsatzsteuer</h2>
      <p>
        <Ph>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG bzw. Wirtschafts-Identifikationsnummer, falls vorhanden; bei
          Kleinunternehmerregelung (§ 19 UStG) diesen Hinweis angeben oder den Abschnitt entfernen</Ph>
      </p>
      <p>
        Die Abonnements werden über unseren Vertriebspartner Paddle.com Market Limited verkauft, der als Händler (Merchant of
        Record) auftritt und die Rechnungen ausstellt.
      </p>

      <h2>Registereintrag</h2>
      <p><Ph>Registergericht und Registernummer, falls eingetragen – sonst Abschnitt entfernen</Ph></p>

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p><Ph>Name und Anschrift – nur nötig bei journalistisch-redaktionellen Inhalten (z. B. Blog), sonst entfernen</Ph></p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
        teilzunehmen. <Ph>Entscheidung bestätigen (§ 36 VSBG)</Ph>
      </p>

      <h2>Open Source</h2>
      <p>
        Der Quellcode von Runmate steht unter der GNU Affero General Public License v3.0 (AGPL-3.0). <Ph>Link zum öffentlichen
          Repository</Ph>
      </p>
    </LegalPage>
  )
}
